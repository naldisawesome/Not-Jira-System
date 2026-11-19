"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signUp } from "@/server/actions/admin";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  orgName: z.string().trim().min(2, "Enter a workspace name"),
  password: z.string().min(8, "At least 8 characters"),
});

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const res = await signUp(v);
    if (!res.ok) return setError(res.error);
    const login = await signIn("credentials", { email: v.email, password: v.password, redirect: false });
    if (login?.error) return router.push(`/login?email=${encodeURIComponent(v.email)}`);
    router.replace("/");
    router.refresh();
  });
  const e = formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">You&apos;ll be the Super Admin and can invite your team next.</p>
      </div>
      <Field label="Your name" error={e.name?.message}><Input {...register("name")} autoComplete="name" /></Field>
      <Field label="Work email" error={e.email?.message}><Input type="email" {...register("email")} autoComplete="email" /></Field>
      <Field label="Workspace name" error={e.orgName?.message}><Input {...register("orgName")} placeholder="Acme Inc." /></Field>
      <Field label="Password" error={e.password?.message}><Input type="password" {...register("password")} autoComplete="new-password" /></Field>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" loading={formState.isSubmitting}>Create workspace</Button>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></p>
    </form>
  );
}
