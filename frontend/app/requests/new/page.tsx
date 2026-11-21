"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { useCreateBuildRequest } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth";

const schema = z.object({
  title: z.string().min(3, "Title too short").max(200),
  description: z.string().min(10, "Add more detail").max(5000),
  budget_inr: z.number().min(100, "Enter a valid budget").max(1000000),
  skills: z.string().optional(),
  timeline_days: z.number().min(1).max(365).optional(),
});
type FormData = z.infer<typeof schema>;

export default function NewBuildRequestPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const { mutateAsync, isPending } = useCreateBuildRequest();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Belt-and-braces: the route's layout already gates this with RequireAuth.
  if (!token) {
    if (typeof window !== "undefined") router.replace("/auth/login");
    return null;
  }

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      const req = await mutateAsync({
        title: data.title,
        description: data.description,
        budget_paise: Math.round(data.budget_inr * 100),
        skills: data.skills ? data.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        timeline_days: data.timeline_days || undefined,
      });
      router.push(`/requests/${req.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <Link href="/requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to build requests
      </Link>

      <div>
        <h1 className="text-display-md flex items-center gap-2"><Hammer className="w-6 h-6 text-primary" /> Post a build request</h1>
        <p className="text-sm text-muted-foreground mt-1">Describe what you need built. Verified builders will apply with a quote.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" placeholder="e.g. Build a React Native MVP for my campus app" error={errors.title?.message} {...register("title")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={6} placeholder="Scope, features, tech preferences, deliverables…" error={errors.description?.message} {...register("description")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="budget_inr">Budget (₹)</Label>
            <Input id="budget_inr" type="number" placeholder="25000" error={errors.budget_inr?.message} {...register("budget_inr", { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeline_days">Timeline (days)</Label>
            <Input id="timeline_days" type="number" placeholder="30" error={errors.timeline_days?.message} {...register("timeline_days", { valueAsNumber: true })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skills">Skills (comma-separated)</Label>
          <Input id="skills" placeholder="React, FastAPI, PostgreSQL" {...register("skills")} />
        </div>

        {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}

        <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          Payment is arranged directly with the builder you select. CodeBazaar surfaces trust signals (Verified Build Score, delivery history) so you can choose confidently.
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={isPending}>Post request</Button>
          <Button type="button" variant="ghost" asChild><Link href="/requests">Cancel</Link></Button>
        </div>
      </form>
    </div>
  );
}
