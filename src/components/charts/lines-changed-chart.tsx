"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LinesChangedChartProps {
  data: { date: string; additions: number; deletions: number }[];
}

export function LinesChangedChart({ data }: LinesChangedChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
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
  );
}
