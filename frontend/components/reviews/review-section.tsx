"use client";
import { useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { reviewsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ReviewRead } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  mentor: "Mentor",
  founder: "Founder",
  contributor: "Contributor",
  user: "User",
};

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "w-5 h-5 transition-colors",
              (hover || value) >= star
                ? "fill-amber-400 text-text-warning"
                : "text-muted-foreground"
            )}
          />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground self-center">
        {value > 0 ? ["", "Poor", "Fair", "Good", "Great", "Excellent"][value] : "Rate this project"}
      </span>
    </div>
  );
}

const schema = z.object({
  overall_score: z.number().min(1, "Please add a rating").max(5),
  headline: z.string().min(5, "Headline too short").max(200),
  body: z.string().min(20, "Write at least 20 characters").max(3000),
  code_quality: z.number().min(1).max(5).optional(),
  idea_score: z.number().min(1).max(5).optional(),
  market_potential: z.number().min(1).max(5).optional(),
});
type FormData = z.infer<typeof schema>;

function ReviewForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { overall_score: 0 },
  });

  const submit = async (data: FormData) => {
    setError(null);
    try {
      await reviewsApi.create(projectId, data);
      qc.invalidateQueries({ queryKey: ["reviews", projectId] });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4 rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm">Write a review</h3>

      <div>
        <Label className="mb-2 block">Overall rating</Label>
        <StarInput value={watch("overall_score") ?? 0} onChange={(v) => setValue("overall_score", v)} />
        {errors.overall_score && <p className="text-xs text-destructive mt-1">{errors.overall_score.message}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Code quality", field: "code_quality" as const },
          { label: "Idea", field: "idea_score" as const },
          { label: "Market fit", field: "market_potential" as const },
        ].map(({ label, field }) => (
          <div key={field}>
            <Label className="mb-1.5 block text-xs">{label} <span className="text-muted-foreground">(optional)</span></Label>
            <StarInput value={watch(field) ?? 0} onChange={(v) => setValue(field, v)} />
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="headline">Headline</Label>
        <Input id="headline" placeholder="Great hackathon project!" error={errors.headline?.message} {...register("headline")} />
      </div>

      <div>
        <Label htmlFor="body">Review</Label>
        <Textarea id="body" rows={4} placeholder="Share your thoughts on the code, idea, and potential…" error={errors.body?.message} {...register("body")} />
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isSubmitting}>Post review</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function ReviewCard({ review, currentUserId, projectId }: { review: ReviewRead; currentUserId?: string; projectId: string }) {
  const qc = useQueryClient();
  const { mutate: del, isPending } = useMutation({
    mutationFn: () => reviewsApi.delete(projectId, review.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", projectId] }),
  });

  return (
    <div className="rounded-xl border bg-card p-5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={cn("w-3.5 h-3.5", s <= review.overall_score ? "fill-amber-400 text-text-warning" : "text-muted-foreground")} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[review.reviewer_role] ?? "User"}</span>
          </div>
          <h4 className="font-medium text-sm mt-1">{review.headline}</h4>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString()}</span>
          {(currentUserId === review.reviewer_id) && (
            <button onClick={() => del()} disabled={isPending} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{review.body}</p>
      {(review.code_quality || review.idea_score || review.market_potential) && (
        <div className="flex gap-4 pt-2 border-t text-xs text-muted-foreground">
          {review.code_quality && <span>Code: {review.code_quality}/5</span>}
          {review.idea_score && <span>Idea: {review.idea_score}/5</span>}
          {review.market_potential && <span>Market: {review.market_potential}/5</span>}
        </div>
      )}
    </div>
  );
}

export function ReviewSection({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const [showForm, setShowForm] = useState(false);
  const token = useAuthStore((s) => s.accessToken);
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews", projectId],
    queryFn: () => reviewsApi.list(projectId),
  });

  // Get current user id from token
  let currentUserId: string | undefined;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      currentUserId = payload.sub;
    } catch {}
  }

  const canReview = !!token && currentUserId !== ownerId;
  const avgScore = reviews?.length ? (reviews.reduce((a, r) => a + r.overall_score, 0) / reviews.length).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Star className="w-4 h-4 text-text-warning fill-amber-400" />
            Reviews
            {avgScore && <span className="text-sm font-normal text-muted-foreground">{avgScore} avg · {reviews?.length} review{reviews?.length !== 1 ? "s" : ""}</span>}
          </h2>
        </div>
        {canReview && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>Write a review</Button>
        )}
      </div>

      {showForm && <ReviewForm projectId={projectId} onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : !reviews?.length ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <Star className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No reviews yet. {canReview ? "Be the first!" : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} currentUserId={currentUserId} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}
