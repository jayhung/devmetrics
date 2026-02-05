import { NextRequest, NextResponse } from "next/server";
import {
  getSummaryStats,
  getCommitsByAuthor,
  getCommitsByAuthorAndRepo,
  getPRsByAuthor,
  getReviewsByReviewer,
  getActivityOverTime,
  getActivityByAuthor,
  getPRActivityOverTime,
  getReviewActivityOverTime,
  getLinesChangedOverTime,
  getDataRange,
  getSyncStateForRepos,
  getAuthorMetrics,
} from "@/lib/metrics";
import { getLastSyncRun } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start") || undefined;
    const end = searchParams.get("end") || undefined;
    const repoIdsParam = searchParams.get("repoIds");
    const repoIds = repoIdsParam
      ? repoIdsParam.split(",").map((id) => parseInt(id, 10))
      : undefined;

    const filters = { start, end, repoIds };
    const repoOnlyFilters = { repoIds }; // for data range/sync state (ignore date filter)

    const [
      summary,
      commitsByAuthor,
      commitsByAuthorAndRepo,
      prsByAuthor,
      reviewsByReviewer,
      activity,
      activityByAuthor,
      prActivity,
      reviewActivity,
      linesChanged,
      dataRange,
      syncState,
      authorMetrics,
    ] = await Promise.all([
      getSummaryStats(filters),
      getCommitsByAuthor(filters),
      getCommitsByAuthorAndRepo(filters),
      getPRsByAuthor(filters),
      getReviewsByReviewer(filters),
      getActivityOverTime(filters),
      getActivityByAuthor(filters),
      getPRActivityOverTime(filters),
      getReviewActivityOverTime(filters),
      getLinesChangedOverTime(filters),
      getDataRange(repoOnlyFilters),
      getSyncStateForRepos(repoOnlyFilters),
      getAuthorMetrics(filters),
    ]);

    const lastSyncRun = getLastSyncRun();

    return NextResponse.json({
      summary,
      commitsByAuthor,
      commitsByAuthorAndRepo,
      prsByAuthor,
      reviewsByReviewer,
      activity,
      activityByAuthor,
      prActivity,
      reviewActivity,
      linesChanged,
      dataRange,
      syncState,
      lastSyncRun,
      authorMetrics,
    });
  } catch (error) {
    console.error("Failed to get metrics:", error);
    return NextResponse.json(
      { error: "Failed to get metrics" },
      { status: 500 }
    );
  }
}
