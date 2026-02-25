"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ContributorChartProps {
  data: { author_login: string; commits: number }[];
}

export function ContributorChart({ data }: ContributorChartProps) {
  const topContributors = data.slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={topContributors} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          dataKey="author_login"
          type="category"
          tick={{ fontSize: 12 }}
          width={100}
        />
        <Tooltip />
        <Bar dataKey="commits" fill="hsl(222.2 47.4% 11.2%)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
