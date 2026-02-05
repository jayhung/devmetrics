"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, AlertCircle, CheckCircle2 } from "lucide-react";

interface Repo {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  added_at: string;
}

interface Status {
  tokenConfigured: boolean;
  tokenError?: string;
  rateLimit?: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}

export default function ConfigPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [repoInput, setRepoInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const fetchRepos = async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      setRepos(data.repos || []);
    } catch (error) {
      console.error("Failed to fetch repos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRepo = async () => {
    if (!repoInput.trim()) return;

    const parts = repoInput.trim().split("/");
    if (parts.length !== 2) {
      alert("Please enter repo in format: owner/name");
      return;
    }

    const [owner, name] = parts;
    setAdding(true);

    try {
      await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, name }),
      });
      setRepoInput("");
      await fetchRepos();
    } catch (error) {
      console.error("Failed to add repo:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveRepo = async (id: number) => {
    if (!confirm("Remove this repository and all its data?")) return;

    try {
      await fetch(`/api/repos?id=${id}`, { method: "DELETE" });
      await fetchRepos();
    } catch (error) {
      console.error("Failed to remove repo:", error);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  };

  useEffect(() => {
    fetchRepos();
    fetchStatus();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Configuration</h2>

      {/* github token status */}
      {status && (
        <Card className={status.tokenConfigured ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {status.tokenConfigured ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              )}
              <div className="flex-1">
                {status.tokenConfigured ? (
                  <>
                    <p className="font-medium text-green-800">GitHub token configured</p>
                    {status.rateLimit && (
                      <p className="text-sm text-green-700 mt-1">
                        API rate limit: {status.rateLimit.remaining.toLocaleString()} / {status.rateLimit.limit.toLocaleString()} requests remaining
                        {status.rateLimit.remaining < 100 && (
                          <span className="text-yellow-700 ml-2">
                            (resets {new Date(status.rateLimit.resetAt).toLocaleTimeString()})
                          </span>
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-medium text-red-800">GitHub token not configured</p>
                    <p className="text-sm text-red-700 mt-1">
                      {status.tokenError || "Set GITHUB_TOKEN in your .env.local file to sync data."}
                    </p>
                    <p className="text-sm text-red-600 mt-2">
                      <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline">
                        Create a token
                      </a>
                      {" "}with the <code className="bg-red-100 px-1 rounded">repo</code> scope.
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add Repository</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="owner/repo (e.g. facebook/react)"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
              disabled={!status?.tokenConfigured}
            />
            <Button onClick={handleAddRepo} disabled={adding || !status?.tokenConfigured}>
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
          {status?.tokenConfigured && (
            <p className="text-sm text-muted-foreground mt-2">
              Enter repositories in owner/repo format
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracked Repositories</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : repos.length === 0 ? (
            <p className="text-muted-foreground">No repositories added yet.</p>
          ) : (
            <ul className="space-y-2">
              {repos.map((repo) => (
                <li
                  key={repo.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div>
                    <p className="font-medium">{repo.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Added {new Date(repo.added_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveRepo(repo.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
