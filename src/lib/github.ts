import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export { octokit };

// rate limit info
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
  used: number;
}

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

// check current rate limit
export async function getRateLimit(): Promise<RateLimitInfo> {
  const response = await octokit.rateLimit.get();
  const core = response.data.rate;
  return {
    remaining: core.remaining,
    limit: core.limit,
    used: core.used,
    resetAt: new Date(core.reset * 1000),
  };
}

// throttle helper - adds delay between requests
const THROTTLE_MS = 100; // 100ms between requests
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < THROTTLE_MS) {
    await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

// check rate limit and throw if too low
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

export async function fetchCommits(
  owner: string,
  repo: string,
  since?: string,
  perPage = 100,
  onProgress?: (msg: string) => void
) {
  const commits = [];
  let page = 1;

  while (true) {
    await throttle();
    await checkRateLimit(5);

    const response = await octokit.repos.listCommits({
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

      const detail = await octokit.repos.getCommit({
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

export async function fetchPullRequests(
  owner: string,
  repo: string,
  since?: string,
  state: "open" | "closed" | "all" = "all",
  perPage = 100,
  onProgress?: (msg: string) => void
) {
  const prs = [];
  let page = 1;
  const sinceDate = since ? new Date(since) : null;

  while (true) {
    await throttle();
    await checkRateLimit(5);

    const response = await octokit.pulls.list({
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
      const detail = await octokit.pulls.get({
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

export async function fetchReviews(owner: string, repo: string, prNumber: number) {
  await throttle();
  
  const response = await octokit.pulls.listReviews({
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
