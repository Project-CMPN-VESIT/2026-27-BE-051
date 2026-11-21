"use client";
import { useState } from "react";
import { Gauge, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives";
import { useDeliveryStats, usePredictDelivery } from "@/lib/hooks";
import type { DelayRisk } from "@/types";
import { cn } from "@/lib/utils";

const RISK_STYLE: Record<DelayRisk, { label: string; variant: "success" | "warning" | "destructive"; icon: React.ReactNode }> = {
  low: { label: "Low delay risk", variant: "success", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  medium: { label: "Medium delay risk", variant: "warning", icon: <Clock className="w-3.5 h-3.5" /> },
  high: { label: "High delay risk", variant: "destructive", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function probTone(p: number) {
  if (p >= 75) return "text-text-success";
  if (p >= 50) return "text-text-warning";
  return "text-text-danger";
}

export function DeliveryReliability({ builderId }: { builderId: string }) {
  const { data: stats } = useDeliveryStats(builderId);
  const { mutate, data: prediction, isPending } = usePredictDelivery();
  const [days, setDays] = useState("7");
  const [milestones, setMilestones] = useState("1");

  const run = () =>
    mutate({ builderId, promisedDays: Math.max(1, Number(days) || 7), milestoneCount: Math.max(1, Number(milestones) || 1) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="w-4 h-4 text-primary" /> Delivery Reliability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats && stats.sample_size > 0 ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg font-bold tabular-nums">
                {stats.on_time_rate == null ? "\u2014" : `${Math.round(stats.on_time_rate * 100)}%`}
              </div>
              <div className="text-[10px] text-muted-foreground">On-time rate</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">
                {stats.avg_turnaround_days == null ? "\u2014" : `${stats.avg_turnaround_days.toFixed(1)}d`}
              </div>
              <div className="text-[10px] text-muted-foreground">Avg turnaround</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{stats.contracts_completed}</div>
              <div className="text-[10px] text-muted-foreground">Contracts done</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No delivery history yet — predictions are a neutral baseline until this builder completes escrow milestones.
          </p>
        )}

        <div className="flex items-end gap-2 pt-1 border-t">
          <div className="space-y-1">
            <Label htmlFor="days" className="text-xs">Deliver in (days)</Label>
            <Input id="days" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms" className="text-xs">Milestones</Label>
            <Input id="ms" type="number" min="1" value={milestones} onChange={(e) => setMilestones(e.target.value)} className="w-20" />
          </div>
          <Button size="sm" onClick={run} loading={isPending}>Predict</Button>
        </div>

        {prediction && (
          <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-3xl font-bold tabular-nums", probTone(prediction.completion_probability))}>
                  {prediction.completion_probability}%
                </span>
                <span className="text-xs text-muted-foreground">on-time confidence</span>
              </div>
              <Badge variant={RISK_STYLE[prediction.delay_risk].variant} className="gap-1">
                {RISK_STYLE[prediction.delay_risk].icon} {RISK_STYLE[prediction.delay_risk].label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Realistic timeline: <b className="text-foreground">{prediction.realistic_timeline_days}d</b> (promised {prediction.promised_days}d)</span>
              <span>Estimate confidence: <b className="text-foreground">{prediction.confidence}%</b></span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{prediction.rationale}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
