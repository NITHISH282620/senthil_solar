"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Coins } from "lucide-react";
import { toast } from "sonner";
import { applyCreditToInvoice, type CreditEntry } from "@/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Sets a client's unallocated credit against this invoice.
 *
 * Overpayments and pre-invoice advances were being recorded correctly and shown
 * nowhere, so the owner would re-bill a client for money already in his bank.
 */
export function ApplyCredit({
  invoiceId,
  credits,
  balanceDue,
}: {
  invoiceId: string;
  credits: CreditEntry[];
  balanceDue: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (credits.length === 0 || balanceDue <= 0) return null;

  const total = credits.reduce((sum, c) => sum + Number(c.amount), 0);

  async function apply(paymentId: string) {
    setBusy(paymentId);
    const { error } = await applyCreditToInvoice(paymentId, invoiceId);
    setBusy(null);

    if (error) toast.error(error);
    else {
      toast.success("Credit set against this invoice.");
      router.refresh();
    }
  }

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium">
            This client already has {formatCurrency(total)} with you
          </p>
          <p className="text-xs text-muted-foreground">
            Money they paid that is not set against any invoice yet. Use it here
            instead of asking for it twice.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {credits.map((credit) => (
          <div
            key={credit.payment_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2"
          >
            <div className="min-w-0 text-sm">
              <span className="font-medium">{formatCurrency(Number(credit.amount))}</span>
              <span className="text-muted-foreground">
                {" "}
                received {formatDate(credit.payment_date)}
                {credit.reference_number ? ` · ${credit.reference_number}` : ""}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => apply(credit.payment_id)}
              disabled={busy !== null}
            >
              {busy === credit.payment_id ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Set against this invoice
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
