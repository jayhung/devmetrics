"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ReviewMonthlyRaw {
  month: string;
  reviewer_login: string;
  count: number;
}

interface ReviewMonthlyChartProps {
  data: ReviewMonthlyRaw[];
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
  "hsl(27, 87%, 54%)",
  "hsl(291, 47%, 51%)",
];

function formatMonth(ym: string) {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function ReviewMonthlyChart({ data }: ReviewMonthlyChartProps) {
  const reviewerTotals = new Map<string, number>();
  for (const row of data) {
    reviewerTotals.set(row.reviewer_login, (reviewerTotals.get(row.reviewer_login) || 0) + row.count);
  }
  const topReviewers = Array.from(reviewerTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reviewer]) => reviewer);

  const monthMap = new Map<string, Record<string, number>>();
  for (const row of data) {
    if (!monthMap.has(row.month)) monthMap.set(row.month, {});
    const entry = monthMap.get(row.month)!;
    if (topReviewers.includes(row.reviewer_login)) {
      entry[row.reviewer_login] = (entry[row.reviewer_login] || 0) + row.count;
    } else {
      entry["Other"] = (entry["Other"] || 0) + row.count;
    }
  }

  const hasOther = Array.from(monthMap.values()).some((e) => e["Other"]);
  const chartData = Array.from(monthMap.entries())
    .map(([month, reviewers]) => ({ month, ...reviewers }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const allKeys = hasOther ? [...topReviewers, "Other"] : topReviewers;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={formatMonth} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip labelFormatter={formatMonth} />
        <Legend />
        {allKeys.map((key, idx) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="a"
            fill={key === "Other" ? "hsl(0, 0%, 60%)" : COLORS[idx % COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
