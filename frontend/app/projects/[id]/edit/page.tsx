"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2, ArrowLeft, Shield, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/ui/layout";
import { useProject, useUpdateProject, useDeleteProject, useMe } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { projectsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ProjectSkillsManager } from "@/components/skills/skills-manager";
import type { ProjectUpdateInput } from "@/types";

const schema = z.object({
  title: z.string().min(1, "Title required").max(200),
  description: z.string().max(2000).optional(),
  stage: z.enum(["idea", "prototype", "mvp", "production"]),
  status: z.enum(["active", "dormant", "archived", "revived"]),
  is_seeking_contributors: z.boolean(),
  // Pricing
  is_for_sale: z.boolean().optional(),
  price_inr: z.number().min(1).max(100000).optional(),
  price_label: z.string().max(100).optional(),
  sale_type: z.enum(["source_code", "collab_access", "custom"]).optional(),
  // Digital delivery (private — revealed to buyer after purchase)
  delivery_url: z.string().max(2000).optional(),
  delivery_instructions: z.string().max(5000).optional(),
  sale_license: z.string().max(5000).optional(),
});
type FormData = z.infer<typeof schema>;

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(id);
  const { data: me } = useMe();
  const { mutateAsync: update, isPending } = useUpdateProject();
  const { mutateAsync: deleteProject, isPending: deleting } = useDeleteProject();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Delivery fields aren't returned by the public project read — fetch them
  // from the owner-gated delivery endpoint to prefill the form.
  const { data: delivery } = useQuery({
    queryKey: ["project-delivery", id],
    queryFn: () => projectsApi.delivery(id),
    enabled: !!project && me?.id === project.owner_id,
    retry: false,
  });

  useEffect(() => {
    if (project) {
      reset({
        title: project.title,
        description: project.description ?? "",
        stage: project.stage,
        status: project.status,
        is_seeking_contributors: project.is_seeking_contributors,
        is_for_sale: project.is_for_sale,
        price_inr: project.price_paise ? project.price_paise / 100 : undefined,
        price_label: project.price_label ?? "",
        sale_type: (project.sale_type as FormData["sale_type"]) ?? undefined,
      });
    }
  }, [project, reset]);

  useEffect(() => {
    if (delivery) {
      setValue("delivery_url", delivery.delivery_url ?? "");
      setValue("delivery_instructions", delivery.delivery_instructions ?? "");
      setValue("sale_license", delivery.sale_license ?? "");
    }
  }, [delivery, setValue]);

  if (isLoading) {
    return (
      <Container width="md" className="py-10 space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </Container>
    );
  }

  if (!project) return null;

  if (me && me.id !== project.owner_id) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">You don&apos;t have permission to edit this project.</p>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const { price_inr, ...projectFields } = data;
      const payload: ProjectUpdateInput = {
        ...projectFields,
        ...(price_inr ? { price_paise: Math.round(price_inr * 100) } : {}),
      };
      await update({ id, data: payload });
      router.push(`/projects/${id}`);
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(id);
      router.push("/dashboard");
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  const handleVerify = async () => {
    if (!githubToken) return;
    setVerifying(true);
    setVerifyMsg(null);
    try {
      await projectsApi.verifyOwnership(id, githubToken);
      setVerifyMsg("Ownership verification complete.");
    } catch (err) {
      setVerifyMsg(getErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Container width="md" className="py-10 space-y-6">
      <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to project
      </Link>

      <div>
        <h1 className="text-display-md">Edit project</h1>
        <p className="text-sm text-muted-foreground mt-1">{project.repo_full_name}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" error={errors.title?.message} {...register("title")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={4} error={errors.description?.message} {...register("description")} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="stage">Stage</Label>
            <select id="stage" className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12" {...register("stage")}>
              <option value="idea">Idea</option>
              <option value="prototype">Prototype</option>
              <option value="mvp">MVP</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select id="status" className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12" {...register("status")}>
              <option value="active">Active</option>
              <option value="dormant">Dormant</option>
              <option value="archived">Archived</option>
              <option value="revived">Revived</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-input" {...register("is_seeking_contributors")} />
          <span className="text-sm">Seeking contributors</span>
        </label>

        {serverError && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{serverError}</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" loading={isPending}>Save changes</Button>
          <Button type="button" variant="ghost" asChild>
            <Link href={`/projects/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>

      {/* Verification */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Verify Ownership
        </h3>
        <p className="text-sm text-muted-foreground">
          Confirm you own this GitHub repository to boost your Verified Build Score.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="GitHub token (repo scope)"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            className="flex-1"
          />
          <Button variant="outline" onClick={handleVerify} loading={verifying} disabled={!githubToken}>
            Verify
          </Button>
        </div>
        {verifyMsg && <p className="text-sm text-muted-foreground">{verifyMsg}</p>}
      </div>

      {/* Pricing */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-primary" /> Sell this project
        </h3>
        <p className="text-sm text-muted-foreground">Set a price so other founders or contributors can purchase access.</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-input" {...register("is_for_sale")} />
          <span className="text-sm">This project is for sale</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Price (₹)</Label>
            <Input type="number" placeholder="999" {...register("price_inr", { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Sale type</Label>
            <select className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12" {...register("sale_type")}>
              <option value="">Select…</option>
              <option value="source_code">Full source code</option>
              <option value="collab_access">Collaboration rights</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Price label</Label>
          <Input placeholder="e.g. Full source code + deployment guide" {...register("price_label")} />
        </div>

        <div className="pt-2 border-t space-y-4">
          <div>
            <h4 className="font-medium text-sm">Digital delivery</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              These details stay private and are revealed to a buyer only after they pay. Use them to hand over the repo, a download link, or setup steps.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Delivery link</Label>
            <Input
              placeholder="e.g. private GitHub repo, Google Drive, or download URL"
              error={errors.delivery_url?.message}
              {...register("delivery_url")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Delivery instructions</Label>
            <Textarea
              rows={3}
              placeholder="How to access and set up the project after purchase (env vars, credentials handover, etc.)"
              error={errors.delivery_instructions?.message}
              {...register("delivery_instructions")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>License / terms</Label>
            <Textarea
              rows={3}
              placeholder="e.g. Single-use license, non-exclusive resale rights, full ownership transfer…"
              error={errors.sale_license?.message}
              {...register("sale_license")}
            />
          </div>
        </div>
      </div>

      {/* Project skills */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Required skills</h3>
        <p className="text-sm text-muted-foreground">Tag the skills contributors need for this project.</p>
        <ProjectSkillsManager projectId={id} />
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-5 space-y-3">
        <h3 className="font-semibold text-sm text-destructive">Danger zone</h3>
        <p className="text-sm text-muted-foreground">
          Removing this project will hide it from discovery. This cannot be undone.
        </p>
        {!confirmDelete ? (
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete project
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm">Are you sure?</span>
            <Button variant="destructive" size="sm" loading={deleting} onClick={handleDelete}>
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </Container>
  );
}

