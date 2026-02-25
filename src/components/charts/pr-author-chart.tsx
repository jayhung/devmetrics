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

interface PRContributorChartProps {
  data: { author_login: string; total: number; merged: number }[];
}

export function PRContributorChart({ data }: PRContributorChartProps) {
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
        <Legend />
        <Bar dataKey="total" name="Opened" fill="hsl(222, 47%, 31%)" />
        <Bar dataKey="merged" name="Merged" fill="hsl(173, 58%, 39%)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
