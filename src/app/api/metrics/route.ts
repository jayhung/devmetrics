import { NextRequest, NextResponse } from "next/server";
import {
  getSummaryStats,
  getCommitsByAuthor,
  getCommitsByAuthorAndRepo,
  getPRsByAuthor,
  getReviewsByReviewer,
  getActivityOverTime,
} from "@/lib/metrics";

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

    const [summary, commitsByAuthor, commitsByAuthorAndRepo, prsByAuthor, reviewsByReviewer, activity] =
      await Promise.all([
        getSummaryStats(filters),
        getCommitsByAuthor(filters),
        getCommitsByAuthorAndRepo(filters),
        getPRsByAuthor(filters),
        getReviewsByReviewer(filters),
        getActivityOverTime(filters),
      ]);

    return NextResponse.json({
      summary,
      commitsByAuthor,
      commitsByAuthorAndRepo,
      prsByAuthor,
      reviewsByReviewer,
      activity,
    });
  } catch (error) {
    console.error("Failed to get metrics:", error);
    return NextResponse.json(
      { error: "Failed to get metrics" },
      { status: 500 }
    );
  }
}
