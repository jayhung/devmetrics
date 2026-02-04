import { NextRequest, NextResponse } from "next/server";
import { getRepos, addRepo, removeRepo } from "@/lib/db";

export async function GET() {
  try {
    const repos = getRepos();
    return NextResponse.json({ repos });
  } catch (error) {
    console.error("Failed to get repos:", error);
    return NextResponse.json({ error: "Failed to get repos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { owner, name } = await request.json();

    if (!owner || !name) {
      return NextResponse.json(
        { error: "Owner and name are required" },
        { status: 400 }
      );
    }

    addRepo(owner, name);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to add repo:", error);
    return NextResponse.json({ error: "Failed to add repo" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    removeRepo(parseInt(id, 10));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove repo:", error);
    return NextResponse.json({ error: "Failed to remove repo" }, { status: 500 });
  }
}
