"use client";
import { useState } from "react";
import { Briefcase, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { useCreateOffer } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import type { OfferType } from "@/types";

const TYPES: { value: OfferType; label: string }[] = [
  { value: "incubation", label: "Incubation" },
  { value: "mentorship", label: "Mentorship" },
  { value: "funding", label: "Funding" },
  { value: "acquisition", label: "Acquisition" },
];

export function MakeOfferButton({ projectId }: { projectId: string }) {
  const create = useCreateOffer();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [type, setType] = useState<OfferType>("incubation");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [equity, setEquity] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    if (!title.trim() || !message.trim()) { setErr("Title and message are required"); return; }
    create.mutate({
      project_id: projectId,
      offer_type: type,
      title: title.trim(),
      message: message.trim(),
      amount_paise: amount ? Math.round(Number(amount) * 100) : undefined,
      equity_percent: equity ? Number(equity) : undefined,
    }, {
      onSuccess: () => { setDone(true); setOpen(false); },
      onError: (e) => setErr(getErrorMessage(e)),
    });
  };

  if (done) {
    return (
      <div className="rounded-xl border border-border-success bg-background-success/50 p-4 flex items-center gap-2 text-sm">
        <Check className="w-4 h-4 text-text-success" /> Offer sent. You&apos;ll be notified when the builder responds.
      </div>
    );
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
        <Briefcase className="w-4 h-4" /> Make an offer
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="w-4 h-4" /> Make an offer</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ot">Type</Label>
          <select id="ot" value={type} onChange={(e) => setType(e.target.value as OfferType)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ot-title">Title</Label>
          <Input id="ot-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Seed investment" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ot-msg">Message</Label>
          <Textarea id="ot-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your offer and terms…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ot-amt">Amount ₹ (optional)</Label>
            <Input id="ot-amt" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ot-eq">Equity % (optional)</Label>
            <Input id="ot-eq" type="number" min="0" max="100" value={equity} onChange={(e) => setEquity(e.target.value)} />
          </div>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} loading={create.isPending}>Send offer</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
