"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { useCreateContract } from "@/lib/hooks";
import { usersApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/api/client";
import { rupees } from "@/lib/escrow";

interface DraftMilestone {
  title: string;
  amount: string; // rupees as string in the form
}

function NewContractForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBuilderId = searchParams.get("builder") ?? "";
  const selectedProjectId = searchParams.get("project") ?? undefined;
  const { mutateAsync, isPending } = useCreateContract();

  const [manualBuilderId, setManualBuilderId] = useState("");
  const builderId = selectedBuilderId || manualBuilderId;
  const prefilled = !!selectedBuilderId;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [commissionPct, setCommissionPct] = useState("10");
  const [milestones, setMilestones] = useState<DraftMilestone[]>([{ title: "", amount: "" }]);
  const [error, setError] = useState<string | null>(null);

  const { data: builder } = useQuery({
    queryKey: ["user-profile", builderId],
    queryFn: () => usersApi.getPublicProfile(builderId),
    enabled: !!builderId && prefilled,
    retry: false,
  });

  const totalPaise = milestones.reduce((sum, m) => {
    const n = Number(m.amount);
    return sum + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
  }, 0);

  const setMilestone = (i: number, patch: Partial<DraftMilestone>) =>
    setMilestones((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const addMilestone = () => setMilestones((ms) => [...ms, { title: "", amount: "" }]);
  const removeMilestone = (i: number) =>
    setMilestones((ms) => (ms.length > 1 ? ms.filter((_, idx) => idx !== i) : ms));

  const submit = async () => {
    setError(null);
    const cleaned = milestones
      .filter((m) => m.title.trim() && Number(m.amount) > 0)
      .map((m) => ({ title: m.title.trim(), amount_paise: Math.round(Number(m.amount) * 100) }));
    if (!builderId.trim()) return setError("Builder user ID is required");
    if (!title.trim()) return setError("Title is required");
    if (!cleaned.length) return setError("Add at least one milestone with a title and amount");

    try {
      const contract = await mutateAsync({
        builder_id: builderId.trim(),
        project_id: selectedProjectId,
        title: title.trim(),
        description: description.trim() || undefined,
        commission_bps: Math.round(Number(commissionPct) * 100),
        milestones: cleaned,
      });
      router.push(`/escrow/${contract.id}`);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <Link href="/escrow" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to escrow
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New escrow contract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {prefilled ? (
            <div className="space-y-1.5">
              <Label>Hiring</Label>
              <div className="flex items-center gap-3 rounded-md border bg-secondary/40 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {builder?.profile?.display_name ?? "Selected builder"}
                  </p>
                  <p className="text-xs text-muted-foreground">This contract will be sent to them to fund &amp; start.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="builder">Builder</Label>
              <Input id="builder" value={manualBuilderId} onChange={(e) => setManualBuilderId(e.target.value)}
                placeholder="Paste a builder ID, or start from a builder's profile / Find builders" />
              <p className="text-xs text-muted-foreground">
                Tip: use <Link href="/builders" className="text-primary hover:underline">Find builders</Link> and click Hire to prefill this.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Build MVP landing + auth" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, deliverables, expectations…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commission">Platform commission (%)</Label>
            <Input id="commission" type="number" min="0" max="30" value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)} className="w-32" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Milestones</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addMilestone} className="gap-1 h-7 text-xs">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            {milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input value={m.title} onChange={(e) => setMilestone(i, { title: e.target.value })}
                  placeholder={`Milestone ${i + 1}`} className="flex-1" />
                <Input type="number" min="1" value={m.amount}
                  onChange={(e) => setMilestone(i, { amount: e.target.value })}
                  placeholder="₹" className="w-28" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeMilestone(i)}
                  className="h-9 w-9 flex-shrink-0" disabled={milestones.length === 1}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{rupees(totalPaise)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={submit} loading={isPending} className="w-full">Create contract</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewContractPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10" />}>
      <NewContractForm />
    </Suspense>
  );
}
