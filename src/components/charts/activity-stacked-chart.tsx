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

interface ActivityByContributorRaw {
  date: string;
  author_login: string;
  commits: number;
}

interface ActivityStackedChartProps {
  data: ActivityByContributorRaw[];
}

// color palette for different contributors
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

export function ActivityStackedChart({ data }: ActivityStackedChartProps) {
  const contributorTotals = new Map<string, number>();
  for (const row of data) {
    contributorTotals.set(
      row.author_login,
      (contributorTotals.get(row.author_login) || 0) + row.commits
    );
  }
  const contributors = Array.from(contributorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([contributor]) => contributor);

  const dateMap = new Map<string, Record<string, number>>();
  for (const row of data) {
    if (!contributors.includes(row.author_login)) continue;
    if (!dateMap.has(row.date)) {
      dateMap.set(row.date, {});
    }
    const dateEntry = dateMap.get(row.date)!;
    dateEntry[row.author_login] = row.commits;
  }

  const chartData = Array.from(dateMap.entries())
    .map(([date, vals]) => ({
      date,
      ...vals,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          labelFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <Legend />
        {contributors.map((contributor, idx) => (
          <Bar
            key={contributor}
            dataKey={contributor}
            stackId="a"
            fill={COLORS[idx % COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
