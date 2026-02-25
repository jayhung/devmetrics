"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface LinesChangedRow {
  date: string;
  additions: number;
  deletions: number;
}

interface LinesChangedByRepoRow extends LinesChangedRow {
  repo: string;
}

interface LinesChangedByContributorRow extends LinesChangedRow {
  author_login: string;
}

export type LinesChangedMode = "combined" | "byProject" | "byContributor";

interface LinesChangedChartProps {
  data: LinesChangedRow[];
  byRepo?: LinesChangedByRepoRow[];
  byContributor?: LinesChangedByContributorRow[];
  mode?: LinesChangedMode;
}

const COLORS = [
  "hsl(222, 47%, 31%)",
  "hsl(173, 58%, 39%)",
  "hsl(43, 74%, 49%)",
  "hsl(12, 76%, 61%)",
  "hsl(262, 52%, 47%)",
  "hsl(197, 71%, 52%)",
  "hsl(339, 82%, 51%)",
  "hsl(83, 45%, 52%)",
];

// monday-based ISO week start date as YYYY-MM-DD
function weekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatWeekTick(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekLabel(value: string) {
  const start = new Date(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

interface EntityRow {
  date: string;
  entity: string;
  additions: number;
  deletions: number;
}

// bucket daily per-entity rows into weekly diverging bar data
function buildWeeklyData(rows: EntityRow[], maxEntities: number) {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.entity, (totals.get(r.entity) || 0) + r.additions + r.deletions);
  }
  const topEntities = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntities)
    .map(([e]) => e);

  const weekMap = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (!topEntities.includes(r.entity)) continue;
    const week = weekStart(r.date);
    if (!weekMap.has(week)) weekMap.set(week, {});
    const entry = weekMap.get(week)!;
    entry[`${r.entity} +`] = (entry[`${r.entity} +`] || 0) + r.additions;
    // store deletions as negative for diverging chart
    entry[`${r.entity} -`] = (entry[`${r.entity} -`] || 0) - r.deletions;
  }

  const chartData = Array.from(weekMap.entries())
    .map(([week, vals]) => ({ week, ...vals }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return { chartData, entities: topEntities };
}

function formatTick(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatLabel(value: string) {
  return new Date(value).toLocaleDateString();
}

export function LinesChangedChart({ data, byRepo, byContributor, mode = "combined" }: LinesChangedChartProps) {
  const { repoChartData, repoEntities } = useMemo(() => {
    if (!byRepo?.length) return { repoChartData: [], repoEntities: [] as string[] };
    const rows = byRepo.map(r => ({ date: r.date, entity: r.repo, additions: r.additions, deletions: r.deletions }));
    const { chartData, entities } = buildWeeklyData(rows, 8);
    return { repoChartData: chartData, repoEntities: entities };
  }, [byRepo]);

  const { contributorChartData, contributorEntities } = useMemo(() => {
    if (!byContributor?.length) return { contributorChartData: [], contributorEntities: [] as string[] };
    const rows = byContributor.map(r => ({
      date: r.date,
      entity: r.author_login,
      additions: r.additions,
      deletions: r.deletions,
    }));
    const { chartData, entities } = buildWeeklyData(rows, 8);
    return { contributorChartData: chartData, contributorEntities: entities };
  }, [byContributor]);

  return (
    <>
      {mode === "combined" && (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={formatTick} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip labelFormatter={formatLabel} />
            <Legend />
            <Area
              type="monotone"
              dataKey="additions"
              name="Additions"
              stroke="hsl(142, 71%, 45%)"
              fill="hsl(142, 71%, 45%)"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="deletions"
              name="Deletions"
              stroke="hsl(0, 84%, 60%)"
              fill="hsl(0, 84%, 60%)"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {mode === "byProject" && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={repoChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} tickFormatter={formatWeekTick} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => Math.abs(v).toLocaleString()} />
            <Tooltip
              labelFormatter={formatWeekLabel}
              formatter={(value: number) => Math.abs(value).toLocaleString()}
              offset={60}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend />
            <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" />
            {repoEntities.map((repo, idx) => (
              <Bar
                key={`${repo}+`}
                dataKey={`${repo} +`}
                name={`${repo} +`}
                stackId="additions"
                fill={COLORS[idx % COLORS.length]}
              />
            ))}
            {repoEntities.map((repo, idx) => (
              <Bar
                key={`${repo}-`}
                dataKey={`${repo} -`}
                name={`${repo} -`}
                stackId="deletions"
                fill={COLORS[idx % COLORS.length]}
                fillOpacity={0.45}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {mode === "byContributor" && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={contributorChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} tickFormatter={formatWeekTick} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => Math.abs(v).toLocaleString()} />
            <Tooltip
              labelFormatter={formatWeekLabel}
              formatter={(value: number) => Math.abs(value).toLocaleString()}
              offset={60}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend />
            <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" />
            {contributorEntities.map((contributor, idx) => (
              <Bar
                key={`${contributor}+`}
                dataKey={`${contributor} +`}
                name={`${contributor} +`}
                stackId="additions"
                fill={COLORS[idx % COLORS.length]}
              />
            ))}
            {contributorEntities.map((contributor, idx) => (
              <Bar
                key={`${contributor}-`}
                dataKey={`${contributor} -`}
                name={`${contributor} -`}
                stackId="deletions"
                fill={COLORS[idx % COLORS.length]}
                fillOpacity={0.45}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </>
  );
}
