"use client";
import { useState } from "react";
import { Building2, Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Textarea } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminGate } from "@/components/admin/gate";
import { usePendingPartners, useVerifyPartner } from "@/lib/hooks/advanced";
import { getErrorMessage } from "@/lib/api/client";
import type { CollegePartner } from "@/types/advanced";

/**
 * Approval queue for institution partner accounts.
 *
 * These stay locked until approved because anyone can claim to be faculty at any
 * institution, and an unverified partner account would hand a stranger an
 * aggregate view of a named college's students.
 */
export default function AdminInstitutionsPage() {
  return (
    <AdminGate>
      <InstitutionsBody />
    </AdminGate>
  );
}

function InstitutionsBody() {
  const { data: partners, isLoading } = usePendingPartners();

  return (
    <Container className="py-8 sm:py-10 max-w-3xl">
      <PageHeader
        title="Institution partners"
        description="Faculty and placement-cell accounts awaiting verification. Approving unlocks an aggregate, read-only dashboard scoped to that institution's students."
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : !partners || partners.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-6 h-6" />}
          title="Nothing pending"
          description="No institution is waiting on verification right now."
        />
      ) : (
        <>
          <Alert
            variant="warning"
            title="Verify affiliation before approving"
            description="Check the contact against the institution's published placement-cell or department page. An approved partner sees aggregate figures for every student who lists that college."
            className="mb-5"
          />
          <div className="space-y-4">
            {partners.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} />
            ))}
          </div>
        </>
      )}
    </Container>
  );
}

function PartnerCard({ partner }: { partner: CollegePartner }) {
  const verify = useVerifyPartner();
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [note, setNote] = useState("");

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
              <h3 className="font-semibold text-sm">{partner.college_name}</h3>
              <Badge variant="warning" size="sm">Unverified</Badge>
            </div>
            {partner.department && (
              <p className="text-xs text-muted-foreground mt-1">{partner.department}</p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground flex-shrink-0">
            Requested{" "}
            {new Date(partner.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 mt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Contact</dt>
            <dd className="font-medium mt-0.5">{partner.contact_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Title</dt>
            <dd className="font-medium mt-0.5">{partner.contact_title ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Account email</dt>
            <dd className="font-medium mt-0.5 font-mono text-[11px] truncate">
              {partner.contact_email ?? "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Website</dt>
            <dd className="mt-0.5 truncate">
              {partner.website_url ? (
                <a
                  href={partner.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-[11px]"
                >
                  {partner.website_url}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="px-4 sm:px-5 py-3 border-t">
        {mode === "none" ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="cta" onClick={() => setMode("approve")}>
              <Check className="w-3.5 h-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
              <X className="w-3.5 h-3.5" /> Need more information
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <Textarea
              rows={2}
              maxLength={1000}
              placeholder={
                mode === "approve"
                  ? "How you confirmed the affiliation."
                  : "What you'd need to see to approve this."
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {verify.isError && <FormError message={getErrorMessage(verify.error)} />}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={mode === "approve" ? "cta" : "outline"}
                loading={verify.isPending}
                onClick={() =>
                  verify.mutate(
                    {
                      partnerId: partner.id,
                      approve: mode === "approve",
                      note: note.trim() || undefined,
                    },
                    { onSuccess: () => setMode("none") },
                  )
                }
              >
                {mode === "approve" ? "Approve and unlock" : "Request more information"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
