"use client";
import { useState } from "react";
import { CheckCircle2, ShieldCheck, ShieldOff, IndianRupee, X } from "lucide-react";
import { AdminPageHeader, AdminTable } from "@/components/admin/shared";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminPayouts, useVerifyPayout, useRecordSettlement } from "@/lib/hooks/admin";
import { getErrorMessage } from "@/lib/api/client";
import type { AdminPayoutRow } from "@/lib/api/admin";

function inr(paise: number): string {
  return "\u20B9" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function SettleModal({ row, onClose }: { row: AdminPayoutRow; onClose: () => void }) {
  const { mutateAsync, isPending } = useRecordSettlement();
  const [amountInr, setAmountInr] = useState((row.outstanding_paise / 100).toString());
  const [method, setMethod] = useState(row.method || "upi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const paise = Math.round(parseFloat(amountInr || "0") * 100);
    if (!paise || paise < 100) {
      setError("Enter a valid amount (min ₹1).");
      return;
    }
    if (paise > row.outstanding_paise) {
      setError(`Amount cannot exceed outstanding (${inr(row.outstanding_paise)}).`);
      return;
    }
    try {
      await mutateAsync({
        userId: row.user_id,
        payload: { amount_paise: paise, method, reference: reference || undefined, note: note || undefined },
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Record settlement</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="text-sm text-muted-foreground">
          Paying <span className="font-medium text-foreground">{row.display_name || row.email}</span>.
          Outstanding balance: <span className="font-medium text-foreground">{inr(row.outstanding_paise)}</span>.
        </div>

        <div className="space-y-1.5">
          <Label>Amount (₹)</Label>
          <Input type="number" value={amountInr} onChange={(e) => setAmountInr(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Method</Label>
          <select
            className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="upi">UPI</option>
            <option value="bank">Bank transfer</option>
            <option value="manual">Manual / other</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Reference / UTR (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference" />
        </div>
        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
        </div>

        {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={submit} disabled={row.outstanding_paise <= 0}>
            Record payout
          </Button>
        </div>
      </div>
    </div>
  );
}

function PayoutRow({ row, onSettle }: { row: AdminPayoutRow; onSettle: (r: AdminPayoutRow) => void }) {
  const { mutate, isPending } = useVerifyPayout();

  return (
    <tr className="hover:bg-accent/30 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium truncate max-w-[180px]">{row.display_name || row.email}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{row.email}</div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="ghost" className="text-[10px] uppercase">{row.method}</Badge>
      </td>
      <td className="px-4 py-3 text-xs">
        {row.method === "upi" ? (
          <span className="font-mono">{row.upi_id || "—"}</span>
        ) : (
          <div className="space-y-0.5">
            <div>{row.account_holder_name || "—"}</div>
            <div className="font-mono text-muted-foreground">{row.account_number_masked} · {row.ifsc}</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-semibold">{inr(row.outstanding_paise)}</div>
        <div className="text-[11px] text-muted-foreground">{inr(row.settled_paise)} settled</div>
      </td>
      <td className="px-4 py-3">
        {row.is_verified ? (
          <span className="flex items-center gap-1 text-xs text-text-success">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Pending</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={!row.is_verified || row.outstanding_paise <= 0}
            title={!row.is_verified ? "Verify payout details first" : row.outstanding_paise <= 0 ? "Nothing outstanding" : ""}
            onClick={() => onSettle(row)}
          >
            <IndianRupee className="w-3 h-3" /> Settle
          </Button>
          {row.is_verified ? (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" loading={isPending}
              onClick={() => mutate({ userId: row.user_id, verified: false })}>
              <ShieldOff className="w-3 h-3" /> Revoke
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" loading={isPending}
              onClick={() => mutate({ userId: row.user_id, verified: true })}>
              <ShieldCheck className="w-3 h-3" /> Verify
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminPayoutsPage() {
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const { data, isLoading } = useAdminPayouts(unverifiedOnly);
  const [settleRow, setSettleRow] = useState<AdminPayoutRow | null>(null);

  return (
    <div>
      <AdminPageHeader
        title="Seller payouts"
        subtitle={data ? `${data.total.toLocaleString()} payout profile(s)` : undefined}
        actions={
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-input"
              checked={unverifiedOnly}
              onChange={(e) => setUnverifiedOnly(e.target.checked)}
            />
            Pending verification only
          </label>
        }
      />

      <AdminTable
        columns={["Seller", "Method", "Details", "Outstanding", "Status", "Actions"]}
        loading={isLoading}
        empty={!isLoading && !data?.items.length}
      >
        {data?.items.map((row) => <PayoutRow key={row.user_id} row={row} onSettle={setSettleRow} />)}
      </AdminTable>

      {settleRow && <SettleModal row={settleRow} onClose={() => setSettleRow(null)} />}
    </div>
  );
}
