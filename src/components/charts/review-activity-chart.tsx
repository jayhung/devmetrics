"use client";

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

interface ReviewActivityChartProps {
  data: { date: string; reviews: number; approvals: number }[];
}

export function ReviewActivityChart({ data }: ReviewActivityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
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
        <Line
          type="monotone"
          dataKey="reviews"
          name="Reviews"
          stroke="hsl(262, 52%, 47%)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="approvals"
          name="Approvals"
          stroke="hsl(173, 58%, 39%)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
