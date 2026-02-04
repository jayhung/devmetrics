import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export { octokit };

export async function fetchCommits(
  owner: string,
  repo: string,
  since?: string,
  perPage = 100
) {
  const commits = [];
  let page = 1;

  while (true) {
    const response = await octokit.repos.listCommits({
      owner,
      repo,
      since,
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    // fetch detailed commit info for additions/deletions
    for (const commit of response.data) {
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
    }

    if (response.data.length < perPage) break;
    page++;
  }

  return commits;
}

export async function fetchPullRequests(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
  perPage = 100
) {
  const prs = [];
  let page = 1;

  while (true) {
    const response = await octokit.pulls.list({
      owner,
      repo,
      state,
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    for (const pr of response.data) {
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
    }

    if (response.data.length < perPage) break;
    page++;
  }

  return prs;
}

export async function fetchReviews(owner: string, repo: string, prNumber: number) {
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
