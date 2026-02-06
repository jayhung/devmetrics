"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MultiSelect, SelectedChips, Option } from "@/components/ui/multi-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SyncConsole } from "@/components/sync-console";
import { ActivityChart } from "@/components/charts/activity-chart";
import { ActivityStackedChart } from "@/components/charts/activity-stacked-chart";
import { AuthorChart } from "@/components/charts/author-chart";
import { PRAuthorChart } from "@/components/charts/pr-author-chart";
import { ReviewAuthorChart } from "@/components/charts/review-author-chart";
import { LinesChangedChart } from "@/components/charts/lines-changed-chart";
import { PRActivityChart } from "@/components/charts/pr-activity-chart";
import { ReviewActivityChart } from "@/components/charts/review-activity-chart";
import { GitCommit, GitPullRequest, Users, Plus, Minus, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";
import {
  displayContributorName,
  displayRepositoryName,
} from "@/lib/display-names";

interface SyncLog {
  type: "start" | "repo_start" | "progress" | "repo_done" | "complete" | "error";
  message: string;
  timestamp: Date;
}

interface Repo {
  id: number;
  full_name: string;
}

interface AuthorMetric {
  author_login: string;
  repo: string;
  commits: number;
  additions: number;
  deletions: number;
  prs_opened: number;
  prs_merged: number;
  reviews_given: number;
  avg_commit_size: number;
  merge_rate: number;
}

interface Metrics {
  summary: {
    commits: number;
    additions: number;
    deletions: number;
    pullRequests: number;
    mergedPRs: number;
    contributors: number;
  };
  commitsByAuthor: { author_login: string; commits: number; additions: number; deletions: number }[];
  commitsByAuthorAndRepo: { author_login: string; repo: string; commits: number; additions: number; deletions: number }[];
  prsByAuthor: { author_login: string; total: number; merged: number }[];
  reviewsByReviewer: { reviewer_login: string; total_reviews: number; approvals: number }[];
  activity: { date: string; commits: number }[];
  activityByAuthor: { date: string; author_login: string; commits: number }[];
  prActivity: { date: string; opened: number; merged: number }[];
  reviewActivity: { date: string; reviews: number; approvals: number }[];
  linesChanged: { date: string; additions: number; deletions: number }[];
  dataRange: { earliest_commit: string | null; latest_commit: string | null };
  syncState: { earliest_sync: string | null; latest_sync: string | null; synced_repos: number; total_repos: number };
  authorMetrics: AuthorMetric[];
  lastSyncRun?: {
    id: number;
    started_at: string;
    completed_at: string | null;
    status: string;
    total_repos: number;
    completed_repos: number;
    total_commits: number;
    total_prs: number;
    total_reviews: number;
    error_message: string | null;
  };
}

type SortColumn = "author_login" | "repo" | "commits" | "prs_opened" | "prs_merged" | "reviews_given" | "additions" | "deletions" | "avg_commit_size";
type SortDirection = "asc" | "desc";

const STORAGE_KEY = "devmetrics-filters";

interface StoredFilters {
  repoIds: string[];
  dateRange?: { from: string; to?: string };
}

function loadFilters(): StoredFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

function saveFilters(repoIds: string[], dateRange: DateRange | undefined) {
  if (typeof window === "undefined") return;
  const data: StoredFilters = {
    repoIds,
    dateRange: dateRange?.from
      ? { from: dateRange.from.toISOString(), to: dateRange.to?.toISOString() }
      : undefined,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearFilters() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [showSyncConsole, setShowSyncConsole] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("commits");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const repoOptions: Option[] = repos.map((r) => ({
    value: String(r.id),
    label: displayRepositoryName(r.full_name),
  }));

  // sorting logic
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const sortedAuthorMetrics = metrics?.authorMetrics
    ? [...metrics.authorMetrics].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (typeof aVal === "string" && typeof bVal === "string") {
          const aStr =
            sortColumn === "author_login"
              ? displayContributorName(aVal)
              : sortColumn === "repo"
                ? displayRepositoryName(aVal)
                : aVal;
          const bStr =
            sortColumn === "author_login"
              ? displayContributorName(bVal)
              : sortColumn === "repo"
                ? displayRepositoryName(bVal)
                : bVal;
          return sortDirection === "asc"
            ? aStr.localeCompare(bStr)
            : bStr.localeCompare(aStr);
        }
        return sortDirection === "asc"
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      })
    : [];

  const SortHeader = ({ column, label, className = "" }: { column: SortColumn; label: string; className?: string }) => (
    <th
      className={`py-2 px-4 cursor-pointer hover:bg-muted/50 select-none ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className={`flex items-center gap-1 ${className.includes("text-right") ? "justify-end" : ""}`}>
        {label}
        {sortColumn === column ? (
          sortDirection === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <span className="w-3" />
        )}
      </div>
    </th>
  );

  // load filters from localStorage on mount
  useEffect(() => {
    const stored = loadFilters();
    if (stored) {
      setSelectedRepoIds(stored.repoIds);
      if (stored.dateRange?.from) {
        setDateRange({
          from: new Date(stored.dateRange.from),
          to: stored.dateRange.to ? new Date(stored.dateRange.to) : undefined,
        });
      }
    }
    setFiltersLoaded(true);
  }, []);

  // save filters when they change
  useEffect(() => {
    if (filtersLoaded) {
      saveFilters(selectedRepoIds, dateRange);
    }
  }, [selectedRepoIds, dateRange, filtersLoaded]);

  const handleClearFilters = () => {
    setSelectedRepoIds([]);
    setDateRange(undefined);
    clearFilters();
  };

  const fetchRepos = async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      setRepos(data.repos || []);
    } catch (error) {
      console.error("Failed to fetch repos:", error);
    }
  };

  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedRepoIds.length > 0) {
        params.set("repoIds", selectedRepoIds.join(","));
      }
      if (dateRange?.from) {
        params.set("start", dateRange.from.toISOString().split("T")[0]);
      }
      if (dateRange?.to) {
        params.set("end", dateRange.to.toISOString().split("T")[0]);
      }
      const res = await fetch(`/api/metrics?${params.toString()}`);
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedRepoIds, dateRange]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncLogs([]);
    setShowSyncConsole(true);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoIds: selectedRepoIds.length > 0 ? selectedRepoIds.map(Number) : undefined,
        }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              setSyncLogs((prev) => [
                ...prev,
                { ...event, timestamp: new Date() },
              ]);
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      await fetchMetrics();
      await fetchRepos();
    } catch (error) {
      console.error("Sync failed:", error);
      setSyncLogs((prev) => [
        ...prev,
        {
          type: "error",
          message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSyncing(false);
    }
  };

  // load repos on mount
  useEffect(() => {
    fetchRepos();
  }, []);

  // refetch metrics when filters change (only after filters loaded)
  useEffect(() => {
    if (filtersLoaded) {
      fetchMetrics();
    }
  }, [fetchMetrics, filtersLoaded]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading metrics...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">No metrics available.</p>
        <p className="text-sm text-muted-foreground">
          Add repositories in the <a href="/config" className="underline">config page</a> and sync data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Data"}
        </Button>
      </div>

      {/* filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <MultiSelect
            options={repoOptions}
            selected={selectedRepoIds}
            onChange={setSelectedRepoIds}
            placeholder="All repositories"
          />
          <DateRangePicker dateRange={dateRange} onChange={setDateRange} />
          {(selectedRepoIds.length > 0 || dateRange) && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <SelectedChips
          options={repoOptions}
          selected={selectedRepoIds}
          onRemove={(id) => setSelectedRepoIds(selectedRepoIds.filter((v) => v !== id))}
        />
        {/* data info bar */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            Data:{" "}
            {metrics.dataRange.earliest_commit
              ? `${formatDate(metrics.dataRange.earliest_commit)} – ${formatDate(metrics.dataRange.latest_commit)}`
              : "No data"}
          </span>
          <span>
            Synced:{" "}
            {metrics.syncState.synced_repos > 0
              ? formatRelativeTime(metrics.syncState.latest_sync)
              : "never"}
          </span>
          <span>
            {metrics.syncState.synced_repos}/{metrics.syncState.total_repos} repos
          </span>
          {metrics.lastSyncRun && (
            <span
              className={
                metrics.lastSyncRun.status === "complete"
                  ? "text-green-600"
                  : metrics.lastSyncRun.status === "partial"
                  ? "text-yellow-600"
                  : metrics.lastSyncRun.status === "error"
                  ? "text-red-600"
                  : "text-blue-600"
              }
            >
              Last sync:{" "}
              {metrics.lastSyncRun.status === "running"
                ? `running (${metrics.lastSyncRun.completed_repos}/${metrics.lastSyncRun.total_repos})`
                : metrics.lastSyncRun.status === "complete"
                ? "success"
                : metrics.lastSyncRun.status === "partial"
                ? `partial (${metrics.lastSyncRun.completed_repos}/${metrics.lastSyncRun.total_repos})`
                : "failed"}
            </span>
          )}
        </div>
      </div>

      {/* summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.summary.commits.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.summary.pullRequests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.summary.mergedPRs} merged
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lines Changed</CardTitle>
            <div className="flex gap-1">
              <Plus className="h-4 w-4 text-green-600" />
              <Minus className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className="text-green-600">+{metrics.summary.additions.toLocaleString()}</span>
              {" / "}
              <span className="text-red-600">-{metrics.summary.deletions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contributors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.summary.contributors}</div>
          </CardContent>
        </Card>
      </div>

      {/* charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Contributors</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.commitsByAuthor.length > 0 ? (
              <AuthorChart
                data={metrics.commitsByAuthor.map((a) => ({
                  ...a,
                  author_login: displayContributorName(a.author_login),
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">No contributor data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commit Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.activity.length > 0 ? (
              <ActivityChart data={metrics.activity} />
            ) : (
              <p className="text-muted-foreground text-center py-8">No activity data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PRs by Author</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.prsByAuthor.length > 0 ? (
              <PRAuthorChart
                data={metrics.prsByAuthor.map((a) => ({
                  ...a,
                  author_login: displayContributorName(a.author_login),
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">No PR data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reviews by Reviewer</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.reviewsByReviewer.length > 0 ? (
              <ReviewAuthorChart
                data={metrics.reviewsByReviewer.map((r) => ({
                  ...r,
                  reviewer_login: displayContributorName(r.reviewer_login),
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">No review data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PR Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.prActivity.length > 0 ? (
              <PRActivityChart data={metrics.prActivity} />
            ) : (
              <p className="text-muted-foreground text-center py-8">No PR activity data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.reviewActivity.length > 0 ? (
              <ReviewActivityChart data={metrics.reviewActivity} />
            ) : (
              <p className="text-muted-foreground text-center py-8">No review activity data</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Lines Changed Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.linesChanged.length > 0 ? (
              <LinesChangedChart data={metrics.linesChanged} />
            ) : (
              <p className="text-muted-foreground text-center py-8">No line change data</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Commits by Author Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.activityByAuthor.length > 0 ? (
              <ActivityStackedChart
                data={metrics.activityByAuthor.map((a) => ({
                  ...a,
                  author_login: displayContributorName(a.author_login),
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">No activity data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* contributor table */}
      <Card>
        <CardHeader>
          <CardTitle>Contributor Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortHeader column="author_login" label="Author" className="text-left" />
                  <SortHeader column="repo" label="Repository" className="text-left" />
                  <SortHeader column="commits" label="Commits" className="text-right" />
                  <SortHeader column="prs_opened" label="PRs" className="text-right" />
                  <SortHeader column="prs_merged" label="Merged" className="text-right" />
                  <SortHeader column="reviews_given" label="Reviews" className="text-right" />
                  <SortHeader column="avg_commit_size" label="Avg Lines" className="text-right" />
                  <SortHeader column="additions" label="Additions" className="text-right" />
                  <SortHeader column="deletions" label="Deletions" className="text-right" />
                </tr>
              </thead>
              <tbody>
                {sortedAuthorMetrics.map((row, idx) => (
                  <tr key={`${row.author_login}-${row.repo}-${idx}`} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-4 font-medium">
                      {displayContributorName(row.author_login)}
                    </td>
                    <td className="py-2 px-4 text-muted-foreground">
                      {displayRepositoryName(row.repo)}
                    </td>
                    <td className="text-right py-2 px-4">{row.commits.toLocaleString()}</td>
                    <td className="text-right py-2 px-4">{row.prs_opened}</td>
                    <td className="text-right py-2 px-4" title={`${row.merge_rate}% merge rate`}>
                      <span>{row.prs_merged}</span>
                      {row.prs_opened > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({row.merge_rate}%)
                        </span>
                      )}
                    </td>
                    <td className="text-right py-2 px-4">{row.reviews_given}</td>
                    <td className="text-right py-2 px-4 text-muted-foreground">
                      {row.avg_commit_size.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-4 text-green-600">
                      +{row.additions.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-4 text-red-600">
                      -{row.deletions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <SyncConsole
        logs={syncLogs}
        isOpen={showSyncConsole}
        onClose={() => setShowSyncConsole(false)}
      />
    </div>
  );
}
