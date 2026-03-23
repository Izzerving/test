"use client";

import * as React from "react";

type DataRow = Record<string, string | number>;

export function ResponsiveContainer({
  width = "100%",
  height = 300,
  children,
}: {
  width?: string | number;
  height?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ width, height }} className="min-h-[240px]">
      {children}
    </div>
  );
}

export function Cell(props: { fill?: string }) {
  void props;
  return null;
}
Cell.displayName = "Cell";

export function PieChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      {children}
    </div>
  );
}

export function Pie({
  data,
  dataKey,
  nameKey,
  children,
}: {
  data: DataRow[];
  dataKey: string;
  nameKey: string;
  children?: React.ReactNode;
}) {
  const fills = React.Children.toArray(children).map((child) =>
    React.isValidElement<{ fill?: string }>(child)
      ? child.props.fill || "#8884d8"
      : "#8884d8",
  );
  const total =
    data.reduce((sum, entry) => sum + Number(entry[dataKey] || 0), 0) || 1;
  let offset = 0;
  const segments = data.map((entry, index) => {
    const value = Number(entry[dataKey] || 0);
    const angle = (value / total) * 360;
    const fill = fills[index] || `hsl(${(index * 67) % 360} 70% 55%)`;
    const segment = `${fill} ${offset}deg ${offset + angle}deg`;
    offset += angle;
    return segment;
  });

  return (
    <div className="flex w-full flex-col items-center gap-4 md:flex-row">
      <div
        className="h-48 w-48 rounded-full border border-border"
        style={{ background: `conic-gradient(${segments.join(", ")})` }}
      />
      <div className="grid flex-1 gap-2 text-sm">
        {data.map((entry, index) => (
          <div
            key={String(entry[nameKey])}
            className="flex items-center justify-between rounded border border-border bg-zinc-900 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{
                  backgroundColor:
                    fills[index] || `hsl(${(index * 67) % 360} 70% 55%)`,
                }}
              />
              <span>{String(entry[nameKey])}</span>
            </div>
            <span>{Number(entry[dataKey] || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
Pie.displayName = "Pie";

export function Legend() {
  return null;
}
export function Tooltip() {
  return null;
}
export function CartesianGrid() {
  return null;
}
export function XAxis() {
  return null;
}
export function YAxis() {
  return null;
}

function getChildTypeName(child: React.ReactNode) {
  return React.isValidElement(child)
    ? (child.type as { displayName?: string; name?: string }).displayName ||
        (child.type as { name?: string }).name
    : undefined;
}

export function Line({
  dataKey,
  stroke,
  name,
}: {
  dataKey: string;
  stroke?: string;
  name?: string;
}) {
  return <>{JSON.stringify({ dataKey, stroke, name })}</>;
}
Line.displayName = "Line";

export function LineChart({
  data,
  children,
}: {
  data: DataRow[];
  children: React.ReactNode;
}) {
  const lines = React.Children.toArray(children)
    .filter((child) => getChildTypeName(child) === "Line")
    .map((child) =>
      React.isValidElement<{ dataKey: string; stroke?: string; name?: string }>(
        child,
      )
        ? child.props
        : null,
    )
    .filter(Boolean) as Array<{
    dataKey: string;
    stroke?: string;
    name?: string;
  }>;

  const width = 800;
  const height = 280;
  const padding = 28;
  const maxValue = Math.max(
    1,
    ...data.flatMap((row) =>
      lines.map((line) => Number(row[line.dataKey] || 0)),
    ),
  );
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const makePath = (dataKey: string) =>
    data
      .map((row, index) => {
        const x = padding + stepX * index;
        const y =
          height -
          padding -
          (Number(row[dataKey] || 0) / maxValue) * (height - padding * 2);
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  return (
    <div className="space-y-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible rounded-xl border border-border bg-zinc-950"
      >
        <line
          x1={padding}
          x2={padding}
          y1={padding / 2}
          y2={height - padding}
          stroke="#3f3f46"
          strokeWidth="1"
        />
        <line
          x1={padding}
          x2={width - padding / 2}
          y1={height - padding}
          y2={height - padding}
          stroke="#3f3f46"
          strokeWidth="1"
        />
        {lines.map((line, index) => (
          <path
            key={line.dataKey}
            d={makePath(line.dataKey)}
            fill="none"
            stroke={line.stroke || ["#22c55e", "#3b82f6", "#f59e0b"][index % 3]}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 text-sm">
        {lines.map((line, index) => (
          <div
            key={line.dataKey}
            className="flex items-center gap-2 rounded border border-border bg-zinc-900 px-3 py-1.5"
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{
                backgroundColor:
                  line.stroke || ["#22c55e", "#3b82f6", "#f59e0b"][index % 3],
              }}
            />
            <span>{line.name || line.dataKey}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
