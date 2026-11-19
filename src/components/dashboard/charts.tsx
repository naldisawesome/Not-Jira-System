"use client";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend } from "recharts";
import { useRouter } from "next/navigation";

const tooltipStyle = { contentStyle: { borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12, boxShadow: "0 4px 12px rgb(0 0 0 / .08)" }, itemStyle: { color: "hsl(var(--foreground))" }, labelStyle: { color: "hsl(var(--muted-foreground))" } };
const axis = { tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" }, axisLine: false, tickLine: false } as const;

export function DonutChart({ data, centerLabel, hrefPrefix }: { data: { name: string; value: number; color: string; key?: string }[]; centerLabel?: string; hrefPrefix?: string }) {
  const router = useRouter();
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none" onClick={(d) => hrefPrefix && d?.key && router.push(hrefPrefix + d.key)} className={hrefPrefix ? "cursor-pointer" : ""}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-1">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
            <span className="font-medium tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarChart({ data, height = 200 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="name" width={70} {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar dataKey="value" name="Tasks" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedBars({ data, keys, height = 240, xKey = "name" }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color: string }[]; height?: number; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...axis} interval={0} tickFormatter={(v: string) => (v.length > 10 ? v.split(" ")[0]! : v)} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={k.color} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} barSize={28} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, height = 240 }: { data: { week: string; created: number; completed: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -16, right: 8 }}>
        <defs>
          <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} /><stop offset="100%" stopColor="#0d9488" stopOpacity={0} /></linearGradient>
          <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey="week" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="created" name="Created" stroke="#6366f1" fill="url(#gNew)" strokeWidth={2} />
        <Area type="monotone" dataKey="completed" name="Completed" stroke="#0d9488" fill="url(#gDone)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
