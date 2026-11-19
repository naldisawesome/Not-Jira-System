"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Star, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { Input, NativeSelect } from "@/components/ui/input";
import { STATUS_CATEGORIES } from "@/lib/constants";
import { createWorkflow, deleteStatus, deleteWorkflow, reorderStatuses, setDefaultWorkflow, upsertStatus } from "@/server/actions/admin";
import { StatusIcon } from "@/components/tasks/badges";

type S = { id: string; name: string; color: string; category: "backlog" | "todo" | "in_progress" | "done" | "cancelled"; position: number; tasks: number };
type W = { id: string; name: string; isDefault: boolean; projects: number; statuses: S[] };

export function WorkflowsAdmin({ workflows }: { workflows: W[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const run = async (p: Promise<{ ok: boolean; error?: string }>, msg?: string) => { const r = await p; if (!r.ok) return toast.error(r.error), false; if (msg) toast.success(msg); router.refresh(); return true; };
  return (
    <div className="space-y-5">
      {workflows.map((w) => <WorkflowCard key={w.id} w={w} run={run} />)}
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(createWorkflow({ name }), "Workflow created")) setName(""); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New workflow name, e.g. Support desk" className="max-w-xs" />
        <Button disabled={name.trim().length < 2}><Plus /> Create workflow</Button>
      </form>
    </div>
  );
}

function WorkflowCard({ w, run }: { w: W; run: (p: Promise<{ ok: boolean; error?: string }>, msg?: string) => Promise<boolean> }) {
  const [order, setOrder] = useState(w.statuses);
  const [draft, setDraft] = useState({ name: "", category: "in_progress" as S["category"], color: "#2563eb" });
  useEffect(() => setOrder(w.statuses), [w.statuses]);
  const move = async (i: number, d: number) => {
    const next = [...order];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    setOrder(next);
    await run(reorderStatuses({ workflowId: w.id, ids: next.map((s) => s.id) }));
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{w.name}{w.isDefault && <Badge color="#0f766e">Default</Badge>}</span>} description={`${w.projects} project(s) · ${order.length} statuses`} action={
        <div className="flex gap-1">
          {!w.isDefault && <Button variant="outline" size="sm" onClick={() => run(setDefaultWorkflow({ id: w.id }), "Default workflow updated")}><Star /> Make default</Button>}
          {!w.isDefault && <Button variant="ghost" size="icon" onClick={() => confirm(`Delete ${w.name}?`) && run(deleteWorkflow({ id: w.id }), "Workflow deleted")} aria-label="Delete workflow"><Trash2 /></Button>}
        </div>
      } />
      <CardContent className="space-y-2">
        <ul className="divide-y rounded-lg border">
          {order.map((s, i) => <StatusRow key={s.id} s={s} i={i} last={i === order.length - 1} others={order.filter((o) => o.id !== s.id)} workflowId={w.id} run={run} move={move} />)}
        </ul>
        <form className="flex flex-wrap items-center gap-2 pt-2" onSubmit={async (e) => { e.preventDefault(); if (await run(upsertStatus({ workflowId: w.id, ...draft }), "Status added")) setDraft({ ...draft, name: "" }); }}>
          <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-9 w-10 cursor-pointer rounded border bg-transparent" aria-label="Color" />
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="New status name" className="w-48" />
          <NativeSelect value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as S["category"] })} className="w-40">{STATUS_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect>
          <Button variant="outline" disabled={!draft.name.trim()}><Plus /> Add status</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StatusRow({ s, i, last, others, workflowId, run, move }: { s: S; i: number; last: boolean; others: S[]; workflowId: string; run: (p: Promise<{ ok: boolean; error?: string }>, msg?: string) => Promise<boolean>; move: (i: number, d: number) => void }) {
  const [v, setV] = useState({ name: s.name, color: s.color, category: s.category });
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const dirty = v.name !== s.name || v.color !== s.color || v.category !== s.category;
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <StatusIcon category={v.category} color={v.color} />
      <input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-7 w-8 cursor-pointer rounded border bg-transparent" aria-label="Color" />
      <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-8 w-44" />
      <NativeSelect value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as S["category"] })} className="h-8 w-36 text-xs">{STATUS_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect>
      <span className="text-xs tabular-nums text-muted-foreground">{s.tasks} tasks</span>
      <div className="ml-auto flex items-center gap-1">
        {dirty && <Button size="sm" onClick={() => run(upsertStatus({ workflowId, id: s.id, ...v }), "Status saved")}><Check /> Save</Button>}
        <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp /></Button>
        <Button variant="ghost" size="icon" disabled={last} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown /></Button>
        {others.length > 0 && (
          <>
            {s.tasks > 0 && <NativeSelect value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-8 w-32 text-xs" aria-label="Move tasks to">{others.map((o) => <option key={o.id} value={o.id}>→ {o.name}</option>)}</NativeSelect>}
            <Button variant="ghost" size="icon" onClick={() => confirm(s.tasks ? `Delete "${s.name}" and move its ${s.tasks} task(s)?` : `Delete "${s.name}"?`) && run(deleteStatus({ workflowId, id: s.id, moveTo }), "Status deleted")} aria-label="Delete status"><Trash2 /></Button>
          </>
        )}
      </div>
    </li>
  );
}
