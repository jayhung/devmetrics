import { NextResponse } from "next/server";
import { getRateLimit, GitHubConfigError } from "@/lib/github";

/**
 * GET /api/status
 * Returns system status including GitHub token validation and rate limit info.
 */
export async function GET() {
  const status: {
    tokenConfigured: boolean;
    tokenError?: string;
    rateLimit?: {
      remaining: number;
      limit: number;
      resetAt: string;
    };
  } = {
    tokenConfigured: false,
  };

  try {
    const rateLimit = await getRateLimit();
    status.tokenConfigured = true;
    status.rateLimit = {
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
      resetAt: rateLimit.resetAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof GitHubConfigError) {
      status.tokenError = error.message;
    } else {
      // token might be configured but invalid
      status.tokenError = error instanceof Error ? error.message : "Unknown error validating token";
    }
  }

  return NextResponse.json(status);
}
