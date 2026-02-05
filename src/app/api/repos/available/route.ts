import { NextResponse } from "next/server";
import { fetchAvailableRepos, GitHubConfigError } from "@/lib/github";

export async function GET() {
  try {
    const repos = await fetchAvailableRepos();
    return NextResponse.json({ repos });
  } catch (error) {
    if (error instanceof GitHubConfigError) {
      return NextResponse.json({ error: error.message, repos: [] }, { status: 401 });
    }
    console.error("Failed to fetch available repos:", error);
    return NextResponse.json({ error: "Failed to fetch available repos", repos: [] }, { status: 500 });
  }
}
