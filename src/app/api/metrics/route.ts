import { NextRequest, NextResponse } from "next/server";
import {
  getSummaryStats,
  getCommitsByContributor,
  getCommitsByContributorAndRepo,
  getPRsByContributor,
  getReviewsByReviewer,
  getActivityOverTime,
  getActivityByContributor,
  getPRActivityOverTime,
  getReviewActivityOverTime,
  getLinesChangedOverTime,
  getLinesChangedByRepo,
  getLinesChangedByContributor,
  getMergedPRsByMonth,
  getReviewsByMonth,
  getMergedPRsByDay,
  getReviewsByDay,
  getDataRange,
  getSyncStateForRepos,
  getContributorMetrics,
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
      commitsByContributor,
      commitsByContributorAndRepo,
      prsByContributor,
      reviewsByReviewer,
      activity,
      activityByContributor,
      prActivity,
      reviewActivity,
      linesChanged,
      linesChangedByRepo,
      linesChangedByContributor,
      mergedPRsByMonth,
      reviewsByMonth,
      mergedPRsByDay,
      reviewsByDay,
      dataRange,
      syncState,
      contributorMetrics,
    ] = await Promise.all([
      getSummaryStats(filters),
      getCommitsByContributor(filters),
      getCommitsByContributorAndRepo(filters),
      getPRsByContributor(filters),
      getReviewsByReviewer(filters),
      getActivityOverTime(filters),
      getActivityByContributor(filters),
      getPRActivityOverTime(filters),
      getReviewActivityOverTime(filters),
      getLinesChangedOverTime(filters),
      getLinesChangedByRepo(filters),
      getLinesChangedByContributor(filters),
      getMergedPRsByMonth(filters),
      getReviewsByMonth(filters),
      getMergedPRsByDay(filters),
      getReviewsByDay(filters),
      getDataRange(repoOnlyFilters),
      getSyncStateForRepos(repoOnlyFilters),
      getContributorMetrics(filters),
    ]);

    const lastSyncRun = getLastSyncRun();

    return NextResponse.json({
      summary,
      commitsByContributor,
      commitsByContributorAndRepo,
      prsByContributor,
      reviewsByReviewer,
      activity,
      activityByContributor,
      prActivity,
      reviewActivity,
      linesChanged,
      linesChangedByRepo,
      linesChangedByContributor,
      mergedPRsByMonth,
      reviewsByMonth,
      mergedPRsByDay,
      reviewsByDay,
      dataRange,
      syncState,
      lastSyncRun,
      contributorMetrics,
    });
  } catch (error) {
    console.error("Failed to get metrics:", error);
    return NextResponse.json(
      { error: "Failed to get metrics" },
      { status: 500 }
    );
  }
}
