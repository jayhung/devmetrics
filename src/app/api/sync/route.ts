import { NextRequest } from "next/server";
import {
  getRepos,
  getRepoByFullName,
  getRepoSyncState,
  updateRepoSyncState,
  insertCommit,
  insertPullRequest,
  insertReview,
  startSyncRun,
  updateSyncRunProgress,
  completeSyncRun,
} from "@/lib/db";
import { fetchCommits, fetchPullRequests, fetchReviews, getRateLimit, RateLimitError, GitHubConfigError } from "@/lib/github";

interface SyncEvent {
  type: "start" | "repo_start" | "progress" | "repo_done" | "complete" | "error";
  message: string;
  data?: Record<string, unknown>;
}

function formatSSE(event: SyncEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  let repoFullName: string | undefined;
  let repoIds: number[] | undefined;
  try {
    const body = await request.json();
    repoFullName = body.repoFullName;
    repoIds = body.repoIds;
  } catch {
    // empty body is fine
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SyncEvent) => {
        controller.enqueue(encoder.encode(formatSSE(event)));
      };

      let syncRunId: number | undefined;
      let completedRepos = 0;

      try {
        let reposToSync: { id: number; owner: string; name: string; full_name: string }[] = [];

        if (repoFullName) {
          // sync specific repo by name
          const repo = getRepoByFullName(repoFullName) as typeof reposToSync[0] | undefined;
          if (!repo) {
            send({ type: "error", message: `Repository ${repoFullName} not found` });
            controller.close();
            return;
          }
          reposToSync = [repo];
        } else if (repoIds && repoIds.length > 0) {
          // sync specific repos by IDs (selected repos)
          const allRepos = getRepos() as typeof reposToSync;
          reposToSync = allRepos.filter((r) => repoIds!.includes(r.id));
        } else {
          // sync all repos
          reposToSync = getRepos() as typeof reposToSync;
        }

        if (reposToSync.length === 0) {
          send({ type: "error", message: "No repositories to sync. Add repos in the config page." });
          controller.close();
          return;
        }

        // check rate limit before starting
        let rateLimit;
        try {
          rateLimit = await getRateLimit();
          send({
            type: "progress",
            message: `GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining (resets ${rateLimit.resetAt.toLocaleTimeString()})`,
          });

          if (rateLimit.remaining < 50) {
            send({
              type: "error",
              message: `Rate limit too low (${rateLimit.remaining} remaining). Wait until ${rateLimit.resetAt.toLocaleTimeString()} to sync.`,
            });
            controller.close();
            return;
          }
        } catch (e) {
          send({
            type: "progress",
            message: `Could not check rate limit: ${e instanceof Error ? e.message : "unknown error"}`,
          });
        }

        // start tracking this sync run
        syncRunId = startSyncRun(reposToSync.length);
        let totalCommits = 0;
        let totalPRs = 0;
        let totalReviews = 0;

        send({
          type: "start",
          message: `Starting sync for ${reposToSync.length} repository(s)...`,
          data: { totalRepos: reposToSync.length, syncRunId, rateLimit },
        });

        const results = [];

        for (let i = 0; i < reposToSync.length; i++) {
          const repo = reposToSync[i];
          const syncState = getRepoSyncState(repo.id);
          const syncStartTime = new Date().toISOString();

          send({
            type: "repo_start",
            message: `[${i + 1}/${reposToSync.length}] Syncing ${repo.full_name}...`,
            data: { repo: repo.full_name, index: i + 1, total: reposToSync.length },
          });

          const repoResult = {
            repo: repo.full_name,
            commits: 0,
            prs: 0,
            reviews: 0,
            incremental: !!syncState,
          };

          // fetch commits (incremental if we have sync state)
          const commitSince = syncState?.last_commit_sync || undefined;
          send({
            type: "progress",
            message: `  Fetching commits${commitSince ? ` since ${new Date(commitSince).toLocaleDateString()}` : " (full sync)"}...`,
          });

          const commits = await fetchCommits(
            repo.owner,
            repo.name,
            commitSince,
            100,
            (msg) => send({ type: "progress", message: msg })
          );
          for (const commit of commits) {
            insertCommit({ ...commit, repo_id: repo.id });
            repoResult.commits++;
          }

          send({
            type: "progress",
            message: `  Found ${repoResult.commits} commit(s)`,
          });

          // fetch PRs (incremental if we have sync state)
          const prSince = syncState?.last_pr_sync || undefined;
          send({
            type: "progress",
            message: `  Fetching pull requests${prSince ? ` since ${new Date(prSince).toLocaleDateString()}` : " (full sync)"}...`,
          });

          const prs = await fetchPullRequests(
            repo.owner,
            repo.name,
            prSince,
            "all",
            100,
            (msg) => send({ type: "progress", message: msg })
          );
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

          send({
            type: "progress",
            message: `  Found ${repoResult.prs} PR(s), ${repoResult.reviews} review(s)`,
          });

          // update sync state
          updateRepoSyncState(repo.id, syncStartTime, syncStartTime);

          // update totals
          totalCommits += repoResult.commits;
          totalPRs += repoResult.prs;
          totalReviews += repoResult.reviews;
          completedRepos++;

          // update sync run progress
          updateSyncRunProgress(syncRunId, completedRepos, totalCommits, totalPRs, totalReviews);

          send({
            type: "repo_done",
            message: `  Completed ${repo.full_name}`,
            data: repoResult,
          });

          results.push(repoResult);
        }

        // mark sync as complete
        completeSyncRun(syncRunId, "complete");

        send({
          type: "complete",
          message: `Sync complete: ${totalCommits} commits, ${totalPRs} PRs, ${totalReviews} reviews`,
          data: { results, totalCommits, totalPRs, totalReviews, syncRunId },
        });

        controller.close();
      } catch (error) {
        // mark sync as failed (partial if some repos completed)
        if (typeof syncRunId !== "undefined") {
          const status = completedRepos > 0 ? "partial" : "error";
          completeSyncRun(syncRunId, status, error instanceof Error ? error.message : String(error));
        }

        // provide helpful error messages for known error types
        if (error instanceof GitHubConfigError) {
          send({
            type: "error",
            message: error.message,
            data: { errorType: "config" },
          });
        } else if (error instanceof RateLimitError) {
          send({
            type: "error",
            message: `Rate limit exceeded. ${completedRepos > 0 ? `Completed ${completedRepos} repo(s) before hitting limit.` : ""} Try again after ${error.resetAt.toLocaleTimeString()}.`,
            data: { resetAt: error.resetAt.toISOString(), completedRepos },
          });
        } else {
          send({
            type: "error",
            message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
