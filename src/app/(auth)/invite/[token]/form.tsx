"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { acceptInvite } from "@/server/actions/admin";

export function AcceptInviteForm({ token, email, org }: { token: string; email: string; org: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const res = await acceptInvite({ token, name, password });
        if (!res.ok) {
          setLoading(false);
          return setError(res.error);
        }
        await signIn("credentials", { email, password, redirect: false });
        router.replace("/");
        router.refresh();
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Join {org}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set up your account for {email}.</p>
      </div>
      <Field label="Full name"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Password" hint="At least 8 characters"><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="w-full" loading={loading}>Accept invitation</Button>
    </form>
  );
}
