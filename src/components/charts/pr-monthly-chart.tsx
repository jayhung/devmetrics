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

interface PRMonthlyRaw {
  month: string;
  author_login: string;
  count: number;
}

interface PRMonthlyChartProps {
  data: PRMonthlyRaw[];
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

export function PRMonthlyChart({ data }: PRMonthlyChartProps) {
  // rank authors by total merged PRs
  const authorTotals = new Map<string, number>();
  for (const row of data) {
    authorTotals.set(row.author_login, (authorTotals.get(row.author_login) || 0) + row.count);
  }
  const topAuthors = Array.from(authorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([author]) => author);

  // pivot: { month, author1: n, author2: n, Other: n }
  const monthMap = new Map<string, Record<string, number>>();
  for (const row of data) {
    if (!monthMap.has(row.month)) monthMap.set(row.month, {});
    const entry = monthMap.get(row.month)!;
    if (topAuthors.includes(row.author_login)) {
      entry[row.author_login] = (entry[row.author_login] || 0) + row.count;
    } else {
      entry["Other"] = (entry["Other"] || 0) + row.count;
    }
  }

  const hasOther = Array.from(monthMap.values()).some((e) => e["Other"]);
  const chartData = Array.from(monthMap.entries())
    .map(([month, authors]) => ({ month, ...authors }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const allKeys = hasOther ? [...topAuthors, "Other"] : topAuthors;

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
