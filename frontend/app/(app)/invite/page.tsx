"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Gift, Users, TrendingUp, Award } from "lucide-react";
import { ReferralCard } from "@/components/growth/referral-card";
import { Container, PageHeader } from "@/components/ui/layout";
import { useAuthStore } from "@/stores/auth";

const PERKS = [
  {
    icon: Users,
    title: "Grow the network",
    desc: "Every builder who joins through your link is credited to you permanently.",
  },
  {
    icon: TrendingUp,
    title: "Climb the campus board",
    desc: "Referrals count toward your college's standing on the campus leaderboard.",
  },
  {
    icon: Award,
    title: "Unlock ambassador status",
    desc: "Consistent referrers can apply to become a campus ambassador.",
  },
];

export default function InvitePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!token) router.replace("/auth/login");
  }, [token, router]);
  if (!token) return null;

  return (
    <Container width="md" className="py-10">
      <PageHeader
        eyebrow="Growth"
        title="Invite & grow"
        icon={<Gift />}
        description="Share your link. When builders join through it, they're credited to you — and it counts toward your campus ranking."
      />

      <ReferralCard />

      <div className="grid sm:grid-cols-3 gap-4 mt-8 stagger">
        {PERKS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3.5">
              <Icon className="w-4 h-4" />
            </span>
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
