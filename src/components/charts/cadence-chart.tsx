"use client";

import { useState } from "react";
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

interface MonthlyPRRow {
  month: string;
  author_login: string;
  count: number;
}

interface MonthlyReviewRow {
  month: string;
  reviewer_login: string;
  count: number;
}

interface CadenceChartProps {
  prData: MonthlyPRRow[];
  reviewData: MonthlyReviewRow[];
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

function formatMonth(ym: string) {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

type Mode = "prs" | "reviews";

export function CadenceChart({ prData, reviewData }: CadenceChartProps) {
  const [mode, setMode] = useState<Mode>("prs");

  // normalize to common shape: { month, person, count }
  const rows =
    mode === "prs"
      ? prData.map((r) => ({ month: r.month, person: r.author_login, count: r.count }))
      : reviewData.map((r) => ({ month: r.month, person: r.reviewer_login, count: r.count }));

  // top 8 by total volume
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.person, (totals.get(r.person) || 0) + r.count);
  }
  const topPeople = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p]) => p);

  // pivot into { month, person1: n, person2: n, ... }
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (!topPeople.includes(r.person)) continue;
    if (!monthMap.has(r.month)) monthMap.set(r.month, {});
    monthMap.get(r.month)![r.person] = r.count;
  }

  const chartData = Array.from(monthMap.entries())
    .map(([month, people]) => ({ month, ...people }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div>
      <div className="mb-3 flex gap-1">
        <button
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            mode === "prs"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setMode("prs")}
        >
          Merged PRs
        </button>
        <button
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            mode === "reviews"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setMode("reviews")}
        >
          Reviews
        </button>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={formatMonth} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip labelFormatter={formatMonth} />
          <Legend />
          {topPeople.map((person, idx) => (
            <Line
              key={person}
              type="monotone"
              dataKey={person}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
