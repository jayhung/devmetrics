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

interface ReviewContributorChartProps {
  data: { reviewer_login: string; total_reviews: number; approvals: number }[];
}

export function ReviewContributorChart({ data }: ReviewContributorChartProps) {
  // take top 10 reviewers
  const topReviewers = data.slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={topReviewers} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          dataKey="reviewer_login"
          type="category"
          tick={{ fontSize: 12 }}
          width={100}
        />
        <Tooltip />
        <Legend />
        <Bar dataKey="total_reviews" name="Reviews" fill="hsl(262, 52%, 47%)" />
        <Bar dataKey="approvals" name="Approvals" fill="hsl(173, 58%, 39%)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
