"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DailyPRRow {
  date: string;
  author_login: string;
  count: number;
}

interface DailyReviewRow {
  date: string;
  reviewer_login: string;
  count: number;
}

interface CadenceChartProps {
  prData: DailyPRRow[];
  reviewData: DailyReviewRow[];
  view?: "heatmap" | "line";
  dataMode?: "prs" | "reviews";
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

// github contribution graph colors
const HEAT_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return HEAT_COLORS[0];
  const ratio = value / max;
  if (ratio <= 0.25) return HEAT_COLORS[1];
  if (ratio <= 0.5) return HEAT_COLORS[2];
  if (ratio <= 0.75) return HEAT_COLORS[3];
  return HEAT_COLORS[4];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// generate all dates between start and end inclusive
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

export function CadenceChart({
  prData,
  reviewData,
  view = "heatmap",
  dataMode = "prs",
}: CadenceChartProps) {
  const rows = useMemo(
    () =>
      dataMode === "prs"
        ? prData.map((r) => ({ date: r.date, person: r.author_login, count: r.count }))
        : reviewData.map((r) => ({ date: r.date, person: r.reviewer_login, count: r.count })),
    [prData, reviewData, dataMode]
  );

  const topPeople = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) {
      totals.set(r.person, (totals.get(r.person) || 0) + r.count);
    }
    const limit = view === "heatmap" ? 12 : 8;
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([p]) => p);
  }, [rows, view]);

  // continuous date range (fill gaps so every day has a column)
  const allDates = useMemo(() => {
    if (rows.length === 0) return [];
    let minDate = rows[0].date;
    let maxDate = rows[0].date;
    for (const r of rows) {
      if (r.date < minDate) minDate = r.date;
      if (r.date > maxDate) maxDate = r.date;
    }
    return dateRange(minDate, maxDate);
  }, [rows]);

  // lookup map: person -> date -> count
  const countMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!topPeople.includes(r.person)) continue;
      if (!map.has(r.person)) map.set(r.person, new Map());
      map.get(r.person)!.set(r.date, r.count);
    }
    return map;
  }, [rows, topPeople]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const r of rows) {
      if (topPeople.includes(r.person) && r.count > max) max = r.count;
    }
    return max;
  }, [rows, topPeople]);

  // for line chart: aggregate to weekly buckets so it's readable
  const lineChartData = useMemo(() => {
    const weekMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!topPeople.includes(r.person)) continue;
      // bucket by monday
      const d = new Date(r.date + "T00:00:00");
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff);
      const week = d.toISOString().slice(0, 10);
      if (!weekMap.has(week)) weekMap.set(week, {});
      weekMap.get(week)![r.person] = (weekMap.get(week)![r.person] || 0) + r.count;
    }
    return Array.from(weekMap.entries())
      .map(([week, people]) => ({ week, ...people }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }, [rows, topPeople]);

  // month labels for heatmap (must be before conditional return to keep hook order stable)
  const monthLabels = useMemo(() => {
    const labels: { month: string; colStart: number }[] = [];
    let lastMonth = "";
    for (let i = 0; i < allDates.length; i++) {
      const m = allDates[i].slice(0, 7);
      if (m !== lastMonth) {
        const d = new Date(allDates[i] + "T00:00:00");
        labels.push({
          month: d.toLocaleDateString("en-US", { month: "short" }),
          colStart: i,
        });
        lastMonth = m;
      }
    }
    return labels;
  }, [allDates]);

  if (view === "line") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={lineChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip labelFormatter={(v) => `Week of ${formatDate(v as string)}`} />
          <Legend />
          {topPeople.map((person, idx) => (
            <Line
              key={person}
              type="monotone"
              dataKey={person}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const cellSize = 14;
  const gap = 2;
  const labelWidth = 110;
  const totalWidth = labelWidth + allDates.length * (cellSize + gap);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: totalWidth }}>
        {/* month labels */}
        <div className="relative" style={{ paddingLeft: labelWidth, height: 20 }}>
          {monthLabels.map((ml, i) => (
            <span
              key={i}
              className="text-xs text-muted-foreground absolute"
              style={{ left: labelWidth + ml.colStart * (cellSize + gap) }}
            >
              {ml.month}
            </span>
          ))}
        </div>

        {/* rows */}
        {topPeople.map((person) => (
          <div key={person} className="flex items-center" style={{ height: cellSize + gap + 2 }}>
            <div
              className="truncate text-xs text-right pr-2 shrink-0"
              style={{ width: labelWidth }}
            >
              {person}
            </div>
            <div className="flex gap-px">
              {allDates.map((date) => {
                const count = countMap.get(person)?.get(date) || 0;
                return (
                  <div
                    key={date}
                    className="rounded-sm cursor-default"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: heatColor(count, maxCount),
                    }}
                    title={`${person}: ${count} ${dataMode === "prs" ? "merged PRs" : "reviews"} on ${formatDateFull(date)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* legend */}
        <div className="flex items-center justify-end gap-1 mt-3 pr-2">
          <span className="text-xs text-muted-foreground mr-1">Less</span>
          {HEAT_COLORS.map((color, i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{ width: cellSize, height: cellSize, backgroundColor: color }}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">More</span>
        </div>
      </div>
    </div>
  );
}
