import { Octokit } from "@octokit/rest";

/**
 * Custom error thrown when GitHub token is missing or invalid.
 */
export class GitHubConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubConfigError";
  }
}

/**
 * Validates that GITHUB_TOKEN is configured.
 * @throws {GitHubConfigError} if token is missing
 */
function validateToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token === "your_github_token_here") {
    throw new GitHubConfigError(
      "GitHub token not configured. Please set GITHUB_TOKEN in your .env.local file. " +
      "See https://github.com/settings/tokens to create a token with 'repo' scope."
    );
  }
  return token;
}

// lazily create octokit instance to allow token validation at runtime
let _octokit: Octokit | null = null;

/**
 * Returns the configured Octokit instance.
 * @throws {GitHubConfigError} if token is missing
 */
export function getOctokit(): Octokit {
  if (!_octokit) {
    const token = validateToken();
    _octokit = new Octokit({ auth: token });
  }
  return _octokit;
}

// for backwards compatibility
export const octokit = new Proxy({} as Octokit, {
  get(_, prop) {
    return (getOctokit() as Record<string | symbol, unknown>)[prop];
  },
});

/** GitHub API rate limit information */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
  used: number;
}

/**
 * Error thrown when GitHub API rate limit is exceeded or too low to continue.
 */
export class RateLimitError extends Error {
  resetAt: Date;
  remaining: number;

  constructor(message: string, resetAt: Date, remaining: number) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
    this.remaining = remaining;
  }
}

/**
 * Fetches current GitHub API rate limit status.
 * @returns Rate limit info including remaining requests and reset time
 * @throws {GitHubConfigError} if token is not configured
 */
export async function getRateLimit(): Promise<RateLimitInfo> {
  const response = await getOctokit().rateLimit.get();
  const core = response.data.rate;
  return {
    remaining: core.remaining,
    limit: core.limit,
    used: core.used,
    resetAt: new Date(core.reset * 1000),
  };
}

// throttle helper - adds delay between requests to avoid hammering the API
const THROTTLE_MS = 100;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < THROTTLE_MS) {
    await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

/**
 * Checks rate limit and throws if below minimum required.
 * @param minRequired - minimum requests needed to continue
 * @throws {RateLimitError} if remaining requests below threshold
 */
async function checkRateLimit(minRequired: number = 10) {
  const rateLimit = await getRateLimit();
  if (rateLimit.remaining < minRequired) {
    throw new RateLimitError(
      `Rate limit too low: ${rateLimit.remaining} remaining, need ${minRequired}. Resets at ${rateLimit.resetAt.toLocaleTimeString()}`,
      rateLimit.resetAt,
      rateLimit.remaining
    );
  }
  return rateLimit;
}

/**
 * Fetches commits from a repository with detailed stats (additions/deletions).
 * @param owner - repository owner
 * @param repo - repository name
 * @param since - ISO date string for incremental fetching
 * @param perPage - results per page (default 100)
 * @param onProgress - optional callback for progress updates
 * @throws {GitHubConfigError} if token is not configured
 * @throws {RateLimitError} if rate limit is exceeded
 */
export async function fetchCommits(
  owner: string,
  repo: string,
  since?: string,
  perPage = 100,
  onProgress?: (msg: string) => void
) {
  const client = getOctokit();
  const commits = [];
  let page = 1;

  while (true) {
    await throttle();
    await checkRateLimit(5);

    const response = await client.repos.listCommits({
      owner,
      repo,
      since,
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    // fetch detailed commit info for additions/deletions
    for (let i = 0; i < response.data.length; i++) {
      const commit = response.data[i];
      await throttle();
      
      // check rate limit periodically
      if (i % 10 === 0) {
        await checkRateLimit(5);
      }

      const detail = await client.repos.getCommit({
        owner,
        repo,
        ref: commit.sha,
      });

      commits.push({
        sha: commit.sha,
        author_login: commit.author?.login || null,
        author_email: commit.commit.author?.email || null,
        message: commit.commit.message,
        additions: detail.data.stats?.additions || 0,
        deletions: detail.data.stats?.deletions || 0,
        committed_at: commit.commit.author?.date || "",
      });

      if (onProgress && commits.length % 20 === 0) {
        onProgress(`    Processed ${commits.length} commits...`);
      }
    }

    if (response.data.length < perPage) break;
    page++;
  }

  return commits;
}

/**
 * Fetches pull requests from a repository with detailed stats.
 * @param owner - repository owner
 * @param repo - repository name
 * @param since - ISO date string for incremental fetching
 * @param state - PR state filter: "open", "closed", or "all"
 * @param perPage - results per page (default 100)
 * @param onProgress - optional callback for progress updates
 * @throws {GitHubConfigError} if token is not configured
 * @throws {RateLimitError} if rate limit is exceeded
 */
export async function fetchPullRequests(
  owner: string,
  repo: string,
  since?: string,
  state: "open" | "closed" | "all" = "all",
  perPage = 100,
  onProgress?: (msg: string) => void
) {
  const client = getOctokit();
  const prs = [];
  let page = 1;
  const sinceDate = since ? new Date(since) : null;

  while (true) {
    await throttle();
    await checkRateLimit(5);

    const response = await client.pulls.list({
      owner,
      repo,
      state,
      sort: "updated",
      direction: "desc",
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    let foundOlder = false;
    for (let i = 0; i < response.data.length; i++) {
      const pr = response.data[i];
      
      // skip PRs older than since date (for incremental sync)
      if (sinceDate && new Date(pr.updated_at) < sinceDate) {
        foundOlder = true;
        continue;
      }

      await throttle();
      
      // check rate limit periodically
      if (i % 10 === 0) {
        await checkRateLimit(5);
      }

      // get detailed PR info for additions/deletions
      const detail = await client.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });

      prs.push({
        id: pr.id,
        number: pr.number,
        author_login: pr.user?.login || null,
        title: pr.title,
        state: pr.state,
        additions: detail.data.additions,
        deletions: detail.data.deletions,
        created_at: pr.created_at,
        merged_at: pr.merged_at,
        closed_at: pr.closed_at,
      });

      if (onProgress && prs.length % 10 === 0) {
        onProgress(`    Processed ${prs.length} PRs...`);
      }
    }

    // stop if we found PRs older than since date
    if (foundOlder) break;
    if (response.data.length < perPage) break;
    page++;
  }

  return prs;
}

/**
 * Fetches reviews for a specific pull request.
 * @param owner - repository owner
 * @param repo - repository name
 * @param prNumber - pull request number
 * @throws {GitHubConfigError} if token is not configured
 */
export async function fetchReviews(owner: string, repo: string, prNumber: number) {
  await throttle();

  const response = await getOctokit().pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
  });

  return response.data.map((review) => ({
    id: review.id,
    reviewer_login: review.user?.login || "unknown",
    state: review.state,
    submitted_at: review.submitted_at || "",
  }));
}

/**
 * Fetches repositories accessible to the authenticated user.
 * Includes owned repos and repos from organizations the user belongs to.
 * @param perPage - results per page (default 100)
 * @throws {GitHubConfigError} if token is not configured
 */
export async function fetchAvailableRepos(perPage = 100) {
  const client = getOctokit();
  const repos: { id: number; full_name: string; owner: string; name: string; private: boolean }[] =
    [];
  let page = 1;

  while (true) {
    await throttle();

    const response = await client.repos.listForAuthenticatedUser({
      visibility: "all",
      affiliation: "owner,collaborator,organization_member",
      sort: "updated",
      direction: "desc",
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    for (const repo of response.data) {
      repos.push({
        id: repo.id,
        full_name: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        private: repo.private,
      });
    }

    if (response.data.length < perPage) break;
    page++;
  }

  return repos;
}
