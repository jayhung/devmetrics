"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, AlertCircle, CheckCircle2, Search, Lock, Loader2 } from "lucide-react";

interface Repo {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  added_at: string;
}

interface AvailableRepo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
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

// parse owner/repo from either "owner/repo" format or GitHub URL
function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // try GitHub URL format: https://github.com/owner/repo/...
  const urlMatch = trimmed.match(/github\.com\/([^\/]+)\/([^\/\s?#]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], name: urlMatch[2].replace(/\.git$/, "") };
  }

  // try owner/repo format
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], name: parts[1] };
  }

  return null;
}

export default function ConfigPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
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

  const fetchAvailableRepos = async () => {
    setLoadingAvailable(true);
    try {
      const res = await fetch("/api/repos/available");
      const data = await res.json();
      setAvailableRepos(data.repos || []);
    } catch (error) {
      console.error("Failed to fetch available repos:", error);
    } finally {
      setLoadingAvailable(false);
    }
  };

  // add repo from manual input (owner/repo or URL)
  const handleAddManual = async () => {
    const parsed = parseRepoInput(repoInput);
    if (!parsed) {
      alert("Please enter a valid repository (owner/repo) or GitHub URL");
      return;
    }

    setAddingManual(true);
    try {
      await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      setRepoInput("");
      await fetchRepos();
    } catch (error) {
      console.error("Failed to add repo:", error);
    } finally {
      setAddingManual(false);
    }
  };

  // add repo from browse modal
  const handleAddFromBrowse = async (repo: AvailableRepo) => {
    setAdding(repo.full_name);
    try {
      await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: repo.owner, name: repo.name }),
      });
      await fetchRepos();
    } catch (error) {
      console.error("Failed to add repo:", error);
    } finally {
      setAdding(null);
    }
  };

  // filter available repos: exclude already tracked and match search query
  const trackedFullNames = useMemo(() => new Set(repos.map((r) => r.full_name)), [repos]);

  const filteredAvailableRepos = useMemo(() => {
    return availableRepos.filter((repo) => {
      if (trackedFullNames.has(repo.full_name)) return false;
      if (!searchQuery.trim()) return true;
      return repo.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [availableRepos, trackedFullNames, searchQuery]);

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
      // fetch available repos once we know token is configured
      if (data.tokenConfigured) {
        fetchAvailableRepos();
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  };

  useEffect(() => {
    fetchRepos();
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Configuration</h2>

      {/* github token status */}
      {status && (
        <Card
          className={
            status.tokenConfigured
              ? "border-green-200 bg-green-50/50"
              : "border-red-200 bg-red-50/50"
          }
        >
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
                        API rate limit: {status.rateLimit.remaining.toLocaleString()} /{" "}
                        {status.rateLimit.limit.toLocaleString()} requests remaining
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
                      {status.tokenError ||
                        "Set GITHUB_TOKEN in your .env.local file to sync data."}
                    </p>
                    <p className="text-sm text-red-600 mt-2">
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Create a token
                      </a>{" "}
                      with the <code className="bg-red-100 px-1 rounded">repo</code> scope.
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
          {!status?.tokenConfigured ? (
            <p className="text-muted-foreground">
              Configure your GitHub token to add repositories.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="owner/repo or GitHub URL"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
                />
                <Button onClick={handleAddManual} disabled={addingManual || !repoInput.trim()}>
                  {addingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
                <Button variant="outline" onClick={() => setShowBrowseModal(true)}>
                  Browse
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter a repository in owner/repo format (e.g. jayhung/devmetrics) or paste a GitHub
                URL (https://github.com/jayhung/devmetrics)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* browse repos modal */}
      <Dialog open={showBrowseModal} onOpenChange={setShowBrowseModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse Repositories</DialogTitle>
            <DialogDescription>
              Select repositories from your GitHub account to track
            </DialogDescription>
          </DialogHeader>
          {loadingAvailable ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading available repositories...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md max-h-80 overflow-y-auto">
                {filteredAvailableRepos.length === 0 ? (
                  <p className="text-muted-foreground text-sm p-4 text-center">
                    {searchQuery
                      ? "No matching repositories found"
                      : availableRepos.length === repos.length
                        ? "All available repositories are already tracked"
                        : "No repositories available"}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filteredAvailableRepos.map((repo) => (
                      <li
                        key={repo.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                          <span className="text-sm">{repo.full_name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddFromBrowse(repo)}
                          disabled={adding === repo.full_name}
                        >
                          {adding === repo.full_name ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Add"
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {filteredAvailableRepos.length} of {availableRepos.length} available
                repositories
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveRepo(repo.id)}>
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
