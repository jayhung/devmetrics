import { NextRequest, NextResponse } from "next/server";
import {
  getRepos,
  getRepoByFullName,
  insertCommit,
  insertPullRequest,
  insertReview,
} from "@/lib/db";
import { fetchCommits, fetchPullRequests, fetchReviews } from "@/lib/github";

export async function POST(request: NextRequest) {
  try {
    const { repoFullName } = await request.json();
    
    let reposToSync: { id: number; owner: string; name: string; full_name: string }[] = [];

    if (repoFullName) {
      // sync specific repo
      const repo = getRepoByFullName(repoFullName) as { id: number; owner: string; name: string; full_name: string } | undefined;
      if (!repo) {
        return NextResponse.json({ error: "Repo not found" }, { status: 404 });
      }
      reposToSync = [repo];
    } else {
      // sync all repos
      reposToSync = getRepos() as { id: number; owner: string; name: string; full_name: string }[];
    }

    const results = [];

    for (const repo of reposToSync) {
      const repoResult = {
        repo: repo.full_name,
        commits: 0,
        prs: 0,
        reviews: 0,
      };

      // fetch and store commits
      const commits = await fetchCommits(repo.owner, repo.name);
      for (const commit of commits) {
        insertCommit({ ...commit, repo_id: repo.id });
        repoResult.commits++;
      }

      // fetch and store PRs
      const prs = await fetchPullRequests(repo.owner, repo.name);
      for (const pr of prs) {
        insertPullRequest({ ...pr, repo_id: repo.id });
        repoResult.prs++;

        // fetch reviews for each PR
        const reviews = await fetchReviews(repo.owner, repo.name, pr.number);
        for (const review of reviews) {
          insertReview({ ...review, pr_id: pr.id });
          repoResult.reviews++;
        }
      }

      results.push(repoResult);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
