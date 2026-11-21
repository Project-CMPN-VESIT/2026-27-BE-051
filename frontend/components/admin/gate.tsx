"use client";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/hooks";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const { data: user, isLoading } = useMe();

  useEffect(() => {
    if (!token) router.replace("/auth/login");
  }, [token, router]);

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="flex w-full px-4 sm:px-6 lg:px-8 py-10 max-w-6xl mx-auto">
        <div className="w-full space-y-5">
          <Skeleton className="h-9 w-52" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[6.5rem] rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="text-display-sm mb-2">Admin access required</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Your account doesn&apos;t have permission to view this area.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
