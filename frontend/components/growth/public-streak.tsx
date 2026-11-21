"use client";
import { StreakCard } from "@/components/growth/streak-card";
import { useUserStreak, useUserStreakCalendar } from "@/lib/hooks/advanced";

/**
 * A builder's commit streak on their public profile.
 *
 * Renders nothing when there's no tracked history — an empty streak card on a
 * profile reads as "this person does nothing", which is a claim we have no basis
 * to make about someone who simply hasn't imported a project yet.
 */
export function PublicStreak({ userId }: { userId: string }) {
  const { data: streak, isLoading } = useUserStreak(userId);
  const { data: calendar } = useUserStreakCalendar(userId, 18);

  if (isLoading) return null;
  if (!streak?.has_data || streak.total_active_days === 0) return null;

  return <StreakCard streak={streak} calendar={calendar} />;
}
