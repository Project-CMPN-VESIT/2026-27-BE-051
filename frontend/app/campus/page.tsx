"use client";
import Link from "next/link";
import { GraduationCap, Trophy, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampusLeaderboard } from "@/lib/hooks";
import { Container, PageHeader } from "@/components/ui/layout";
import { cn } from "@/lib/utils";

const RANK = ["text-text-warning", "text-muted-foreground", "text-text-warning/70"];

export default function CampusPage() {
  const { data, isLoading } = useCampusLeaderboard();

  return (
    <Container width="lg" className="py-10">
      <PageHeader
        eyebrow="Growth"
        title="Campus leaderboard"
        icon={<GraduationCap />}
        description="Which colleges ship the most, and the ambassadors driving them."
      />

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-text-warning" /> Top colleges</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {!data?.colleges.length ? (
                <p className="text-sm text-muted-foreground">No colleges ranked yet.</p>
              ) : data.colleges.map((c, i) => (
                <div key={c.college} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("w-5 text-center font-bold text-sm", i < 3 ? RANK[i] : "text-muted-foreground")}>{i + 1}</span>
                    <span className="text-sm truncate">{c.college}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                    <Users className="w-3 h-3" /> {c.builder_count}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary" /> Top ambassadors</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {!data?.ambassadors.length ? (
                <p className="text-sm text-muted-foreground">No ambassadors yet. Be the first!</p>
              ) : data.ambassadors.map((a, i) => (
                <Link key={a.user_id} href={`/u/${a.user_id}`}
                  className="flex items-center justify-between gap-3 py-2 border-b last:border-0 hover:bg-secondary/30 rounded px-1 -mx-1 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("w-5 text-center font-bold text-sm", i < 3 ? RANK[i] : "text-muted-foreground")}>{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{a.display_name}</div>
                      {a.college && <div className="text-[10px] text-muted-foreground truncate">{a.college}</div>}
                    </div>
                  </div>
                  <span className="text-xs font-semibold tabular-nums flex-shrink-0">{a.referrals} invited</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </Container>
  );
}
