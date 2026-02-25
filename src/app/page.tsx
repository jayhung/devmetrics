"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MultiSelect, SelectedChips, Option } from "@/components/ui/multi-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SyncConsole } from "@/components/sync-console";
import { ActivityChart } from "@/components/charts/activity-chart";
import { ActivityStackedChart } from "@/components/charts/activity-stacked-chart";
import { ContributorChart } from "@/components/charts/author-chart";
import { PRContributorChart } from "@/components/charts/pr-author-chart";
import { ReviewContributorChart } from "@/components/charts/review-author-chart";
import { LinesChangedChart, type LinesChangedMode } from "@/components/charts/lines-changed-chart";
import { PRActivityChart } from "@/components/charts/pr-activity-chart";
import { ReviewActivityChart } from "@/components/charts/review-activity-chart";
import { PRMonthlyChart } from "@/components/charts/pr-monthly-chart";
import { ReviewMonthlyChart } from "@/components/charts/review-monthly-chart";
import { CadenceChart } from "@/components/charts/cadence-chart";
import { GitCommit, GitPullRequest, Users, Plus, Minus, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";
import { displayContributorName, displayRepositoryName } from "@/lib/display-names";

interface SyncLog {
  type: "start" | "repo_start" | "progress" | "repo_done" | "complete" | "error";
  message: string;
  timestamp: Date;
}

interface Repo {
  id: number;
  full_name: string;
}

interface ContributorMetric {
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

interface CombinedContributorMetric {
  author_login: string;
  repo_count: number;
  commits: number;
  additions: number;
  deletions: number;
  prs_opened: number;
  prs_merged: number;
  reviews_given: number;
  avg_commit_size: number;
  merge_rate: number;
  avg_prs_mo: number;
  avg_reviews_mo: number;
  avg_prs_mo_active: number;
  avg_reviews_mo_active: number;
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
  commitsByContributor: {
    author_login: string;
    commits: number;
    additions: number;
    deletions: number;
  }[];
  commitsByContributorAndRepo: {
    author_login: string;
    repo: string;
    commits: number;
    additions: number;
    deletions: number;
  }[];
  prsByContributor: { author_login: string; total: number; merged: number }[];
  reviewsByReviewer: { reviewer_login: string; total_reviews: number; approvals: number }[];
  activity: { date: string; commits: number }[];
  activityByContributor: { date: string; author_login: string; commits: number }[];
  prActivity: { date: string; opened: number; merged: number }[];
  reviewActivity: { date: string; reviews: number; approvals: number }[];
  linesChanged: { date: string; additions: number; deletions: number }[];
  linesChangedByRepo: { date: string; repo: string; additions: number; deletions: number }[];
  linesChangedByContributor: { date: string; author_login: string; additions: number; deletions: number }[];
  mergedPRsByMonth: { month: string; author_login: string; count: number }[];
  reviewsByMonth: { month: string; reviewer_login: string; count: number }[];
  dataRange: { earliest_commit: string | null; latest_commit: string | null };
  syncState: {
    earliest_sync: string | null;
    latest_sync: string | null;
    synced_repos: number;
    total_repos: number;
  };
  contributorMetrics: ContributorMetric[];
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

type SortColumn =
  | "author_login"
  | "repo"
  | "repo_count"
  | "commits"
  | "prs_opened"
  | "prs_merged"
  | "reviews_given"
  | "additions"
  | "deletions"
  | "avg_commit_size"
  | "avg_prs_mo"
  | "avg_reviews_mo";
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
    dateRange: dateRange?.from ? { from: dateRange.from.toISOString(), to: dateRange.to?.toISOString() } : undefined,
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    // set default time range to last 90 days
    const now = new Date();
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { from, to: now };
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [showSyncConsole, setShowSyncConsole] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("commits");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showCombined, setShowCombined] = useState(true);
  const [linesChangedMode, setLinesChangedMode] = useState<LinesChangedMode>("combined");

  const repoOptions: Option[] = repos.map(r => ({
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

  const sortedContributorMetrics = metrics?.contributorMetrics
    ? [...metrics.contributorMetrics].sort((a, b) => {
        // columns only valid in combined view fall back to commits
        const combinedOnly = ["repo_count", "avg_prs_mo", "avg_reviews_mo"];
        const col: keyof ContributorMetric = combinedOnly.includes(sortColumn)
          ? "commits"
          : (sortColumn as keyof ContributorMetric);
        const aVal = a[col];
        const bVal = b[col];
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
          return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
        }
        return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      })
    : [];

  // total months in the selected date range (for avg/mo calculations)
  const totalMonthsInRange = useMemo(() => {
    if (!dateRange?.from) {
      // fallback: use data range
      if (!metrics?.dataRange?.earliest_commit || !metrics?.dataRange?.latest_commit) return 1;
      const start = new Date(metrics.dataRange.earliest_commit);
      const end = new Date(metrics.dataRange.latest_commit);
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
      return Math.max(months, 1);
    }
    const start = dateRange.from;
    const end = dateRange.to || new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(months, 1);
  }, [dateRange, metrics?.dataRange]);

  // active months per person from monthly data
  const activeMonthsMap = useMemo(() => {
    const prMonths = new Map<string, Set<string>>();
    for (const r of metrics?.mergedPRsByMonth || []) {
      if (!prMonths.has(r.author_login)) prMonths.set(r.author_login, new Set());
      prMonths.get(r.author_login)!.add(r.month);
    }
    const reviewMonths = new Map<string, Set<string>>();
    for (const r of metrics?.reviewsByMonth || []) {
      if (!reviewMonths.has(r.reviewer_login)) reviewMonths.set(r.reviewer_login, new Set());
      reviewMonths.get(r.reviewer_login)!.add(r.month);
    }
    return { prMonths, reviewMonths };
  }, [metrics?.mergedPRsByMonth, metrics?.reviewsByMonth]);

  const combinedContributorMetrics = useMemo((): CombinedContributorMetric[] => {
    if (!metrics?.contributorMetrics) return [];
    const map = new Map<string, CombinedContributorMetric>();
    for (const row of metrics.contributorMetrics) {
      const existing = map.get(row.author_login);
      if (existing) {
        existing.commits += row.commits;
        existing.additions += row.additions;
        existing.deletions += row.deletions;
        existing.prs_opened += row.prs_opened;
        existing.prs_merged += row.prs_merged;
        existing.reviews_given += row.reviews_given;
        existing.repo_count += 1;
      } else {
        map.set(row.author_login, {
          ...row,
          repo_count: 1,
          avg_prs_mo: 0,
          avg_reviews_mo: 0,
          avg_prs_mo_active: 0,
          avg_reviews_mo_active: 0,
        });
      }
    }
    for (const row of map.values()) {
      row.avg_commit_size = row.commits > 0 ? Math.round((row.additions + row.deletions) / row.commits) : 0;
      row.merge_rate = row.prs_opened > 0 ? Math.round((row.prs_merged / row.prs_opened) * 100) : 0;
      row.avg_prs_mo = parseFloat((row.prs_merged / totalMonthsInRange).toFixed(1));
      row.avg_reviews_mo = parseFloat((row.reviews_given / totalMonthsInRange).toFixed(1));
      const activePrMonths = activeMonthsMap.prMonths.get(row.author_login)?.size || 0;
      const activeReviewMonths = activeMonthsMap.reviewMonths.get(row.author_login)?.size || 0;
      row.avg_prs_mo_active = activePrMonths > 0 ? parseFloat((row.prs_merged / activePrMonths).toFixed(1)) : 0;
      row.avg_reviews_mo_active =
        activeReviewMonths > 0 ? parseFloat((row.reviews_given / activeReviewMonths).toFixed(1)) : 0;
    }
    return [...map.values()];
  }, [metrics?.contributorMetrics, totalMonthsInRange, activeMonthsMap]);

  const sortedCombinedMetrics = useMemo((): CombinedContributorMetric[] => {
    return [...combinedContributorMetrics].sort((a, b) => {
      if (sortColumn === "author_login") {
        const aStr = displayContributorName(a.author_login);
        const bStr = displayContributorName(b.author_login);
        return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      }
      // map "repo" to "repo_count" in combined view
      const col: keyof CombinedContributorMetric = sortColumn === "repo" ? "repo_count" : sortColumn;
      const aVal = a[col] as number;
      const bVal = b[col] as number;
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [combinedContributorMetrics, sortColumn, sortDirection]);

  const SortHeader = ({ column, label, className = "" }: { column: SortColumn; label: string; className?: string }) => (
    <th
      className={`cursor-pointer select-none px-4 py-2 hover:bg-muted/50 ${className}`}
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
              setSyncLogs(prev => [...prev, { ...event, timestamp: new Date() }]);
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
      setSyncLogs(prev => [
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
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading metrics...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No metrics available.</p>
        <p className="text-sm text-muted-foreground">
          Add repositories in the{" "}
          <a href="/config" className="underline">
            config page
          </a>{" "}
          and sync data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Data"}
        </Button>
      </div>

      {/* filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
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
          onRemove={id => setSelectedRepoIds(selectedRepoIds.filter(v => v !== id))}
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
            Synced: {metrics.syncState.synced_repos > 0 ? formatRelativeTime(metrics.syncState.latest_sync) : "never"}
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
            <p className="text-xs text-muted-foreground">{metrics.summary.mergedPRs} merged</p>
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
            {metrics.commitsByContributor.length > 0 ? (
              <ContributorChart
                data={metrics.commitsByContributor.map(a => ({
                  ...a,
                  author_login: displayContributorName(a.author_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No contributor data</p>
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
              <p className="py-8 text-center text-muted-foreground">No activity data</p>
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
              <p className="py-8 text-center text-muted-foreground">No PR activity data</p>
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
              <p className="py-8 text-center text-muted-foreground">No review activity data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PRs by Contributor</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.prsByContributor.length > 0 ? (
              <PRContributorChart
                data={metrics.prsByContributor.map(a => ({
                  ...a,
                  author_login: displayContributorName(a.author_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No PR data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Merged PRs / Month</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.mergedPRsByMonth.length > 0 ? (
              <PRMonthlyChart
                data={metrics.mergedPRsByMonth.map(r => ({
                  ...r,
                  author_login: displayContributorName(r.author_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No merged PR data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reviews by Reviewer</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.reviewsByReviewer.length > 0 ? (
              <ReviewContributorChart
                data={metrics.reviewsByReviewer.map(r => ({
                  ...r,
                  reviewer_login: displayContributorName(r.reviewer_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No review data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reviews / Month</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.reviewsByMonth.length > 0 ? (
              <ReviewMonthlyChart
                data={metrics.reviewsByMonth.map(r => ({
                  ...r,
                  reviewer_login: displayContributorName(r.reviewer_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No review data</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Commits by Contributor</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.activityByContributor.length > 0 ? (
              <ActivityStackedChart
                data={metrics.activityByContributor.map(a => ({
                  ...a,
                  author_login: displayContributorName(a.author_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No activity data</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Contributor Cadence</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.mergedPRsByMonth.length > 0 || metrics.reviewsByMonth.length > 0 ? (
              <CadenceChart
                prData={metrics.mergedPRsByMonth.map(r => ({
                  ...r,
                  author_login: displayContributorName(r.author_login),
                }))}
                reviewData={metrics.reviewsByMonth.map(r => ({
                  ...r,
                  reviewer_login: displayContributorName(r.reviewer_login),
                }))}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">No cadence data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* contributor table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contributor Details</CardTitle>
          <div className="flex gap-1">
            <button
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                showCombined ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setShowCombined(true)}
            >
              Combined
            </button>
            <button
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                !showCombined
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setShowCombined(false)}
            >
              By Project
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortHeader column="author_login" label="Contributor" className="text-left" />
                  {showCombined ? (
                    <SortHeader column="repo_count" label="Repos" className="text-right" />
                  ) : (
                    <SortHeader column="repo" label="Repository" className="text-left" />
                  )}
                  <SortHeader column="commits" label="Commits" className="text-right" />
                  <SortHeader column="prs_opened" label="PRs" className="text-right" />
                  <SortHeader column="prs_merged" label="Merged" className="text-right" />
                  {showCombined && <SortHeader column="avg_prs_mo" label="PRs/mo" className="text-right" />}
                  <SortHeader column="reviews_given" label="Reviews" className="text-right" />
                  {showCombined && <SortHeader column="avg_reviews_mo" label="Reviews/mo" className="text-right" />}
                  <SortHeader column="avg_commit_size" label="Avg Lines" className="text-right" />
                  <SortHeader column="additions" label="Additions" className="text-right" />
                  <SortHeader column="deletions" label="Deletions" className="text-right" />
                </tr>
              </thead>
              <tbody>
                {showCombined
                  ? sortedCombinedMetrics.map(row => (
                      <tr key={row.author_login} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{displayContributorName(row.author_login)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{row.repo_count}</td>
                        <td className="px-4 py-2 text-right">{row.commits.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{row.prs_opened}</td>
                        <td className="px-4 py-2 text-right" title={`${row.merge_rate}% merge rate`}>
                          <span>{row.prs_merged}</span>
                          {row.prs_opened > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">({row.merge_rate}%)</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-2 text-right"
                          title={row.avg_prs_mo_active > 0 ? `${row.avg_prs_mo_active}/mo when active` : undefined}
                        >
                          {row.avg_prs_mo}
                        </td>
                        <td className="px-4 py-2 text-right">{row.reviews_given}</td>
                        <td
                          className="px-4 py-2 text-right"
                          title={
                            row.avg_reviews_mo_active > 0 ? `${row.avg_reviews_mo_active}/mo when active` : undefined
                          }
                        >
                          {row.avg_reviews_mo}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {row.avg_commit_size.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-green-600">+{row.additions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-red-600">-{row.deletions.toLocaleString()}</td>
                      </tr>
                    ))
                  : sortedContributorMetrics.map((row, idx) => (
                      <tr key={`${row.author_login}-${row.repo}-${idx}`} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{displayContributorName(row.author_login)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{displayRepositoryName(row.repo)}</td>
                        <td className="px-4 py-2 text-right">{row.commits.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{row.prs_opened}</td>
                        <td className="px-4 py-2 text-right" title={`${row.merge_rate}% merge rate`}>
                          <span>{row.prs_merged}</span>
                          {row.prs_opened > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">({row.merge_rate}%)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{row.reviews_given}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {row.avg_commit_size.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-green-600">+{row.additions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-red-600">-{row.deletions.toLocaleString()}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lines Changed Over Time</CardTitle>
          <div className="flex gap-1">
            {(["combined", "byProject", "byContributor"] as const).map(m => (
              <button
                key={m}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  linesChangedMode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setLinesChangedMode(m)}
              >
                {m === "combined" ? "Combined" : m === "byProject" ? "By Project" : "By Contributor"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {metrics.linesChanged.length > 0 ? (
            <LinesChangedChart
              data={metrics.linesChanged}
              byRepo={metrics.linesChangedByRepo.map(r => ({
                ...r,
                repo: displayRepositoryName(r.repo),
              }))}
              byContributor={metrics.linesChangedByContributor.map(r => ({
                ...r,
                author_login: displayContributorName(r.author_login),
              }))}
              mode={linesChangedMode}
            />
          ) : (
            <p className="py-8 text-center text-muted-foreground">No line change data</p>
          )}
        </CardContent>
      </Card>

      <SyncConsole logs={syncLogs} isOpen={showSyncConsole} onClose={() => setShowSyncConsole(false)} />
    </div>
  );
}
