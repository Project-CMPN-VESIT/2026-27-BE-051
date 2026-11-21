"use client";
import { useState } from "react";
import { Gift, Copy, Check, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferral, useApplyAmbassador } from "@/lib/hooks";

export function ReferralCard() {
  const { data, isLoading } = useReferral();
  const { mutate: apply, isPending } = useApplyAmbassador();
  const [copied, setCopied] = useState(false);

  if (isLoading) return <Skeleton className="h-52 w-full rounded-xl" />;
  if (!data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="w-4 h-4 text-primary" /> Invite builders
        </CardTitle>
        {data.is_campus_ambassador && (
          <Badge variant="info" className="gap-1"><GraduationCap className="w-3 h-3" /> Campus Ambassador</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-secondary/40 px-3 py-2 text-sm">{data.referral_link}</code>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 flex-shrink-0">
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </Button>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-muted-foreground" />
            <b className="tabular-nums">{data.referred_count}</b> invited
          </span>
          <span className="text-muted-foreground">Code: <b className="text-foreground">{data.referral_code}</b></span>
        </div>

        {!data.is_campus_ambassador && (
          <div className="rounded-xl border border-dashed p-3 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Represent your college and climb the campus leaderboard.
            </div>
            <Button size="sm" variant="outline" onClick={() => apply()} loading={isPending} className="flex-shrink-0">
              Become ambassador
            </Button>
          </div>
        )}

        {data.recent_referrals.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t">
            <p className="text-xs font-medium text-muted-foreground pt-2">Recent invites</p>
            {data.recent_referrals.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between text-xs">
                <span>{r.display_name}</span>
                <span className="text-muted-foreground">{new Date(r.joined_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
