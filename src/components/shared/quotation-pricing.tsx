"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { recordNegotiatedAmount, createRevisedQuotation } from "@/actions/quotations";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QuotationPricingProps {
  quotationId: string;
  status: string;
  ourAsk: number;
  /** From v_quotation_totals — the single source for what the client agreed to. */
  clientAgreedTotal: number;
  difference: number;
  hasLineNegotiation: boolean;
  negotiatedNotes: string | null;
  canEdit: boolean;
}

/**
 * The two-sided price his own records always kept: what he asked for, next
 * to what the client actually agreed to after bargaining. Sourced from
 * v_quotation_totals so this header always agrees with the per-line
 * comparison table below it — never a second, independently-computed figure.
 *
 * The quick "Update client price" dialog (a single lump-sum negotiated_amount)
 * is the fallback for a quote that was never itemized per line; once any
 * line has been individually negotiated, that one number stops being read
 * (see v_quotation_totals), so the dialog hides itself rather than offer a
 * second, ignored way to change the figure.
 */
export function QuotationPricing({
  quotationId,
  status,
  ourAsk,
  clientAgreedTotal,
  difference,
  hasLineNegotiation,
  negotiatedNotes,
  canEdit,
}: QuotationPricingProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(clientAgreedTotal));
  const [notes, setNotes] = useState(negotiatedNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);

  const negotiated = difference !== 0;
  const canRecord =
    canEdit && !hasLineNegotiation && (status === "sent" || status === "approved");
  const canRevise = canEdit && (status === "rejected" || status === "expired");

  async function handleSave() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setSaving(true);
    const result = await recordNegotiatedAmount(quotationId, parsed, notes.trim() || null);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Client-agreed price recorded.");
    setOpen(false);
    router.refresh();
  }

  async function handleRevise() {
    setRevising(true);
    const result = await createRevisedQuotation(quotationId);
    setRevising(false);
    if (result.error || !result.data) {
      toast.error(result.error ?? "Could not create a revised quotation.");
      return;
    }
    toast.success("Revised quotation created — pick up the price from here.");
    router.push(`/quotations/${result.data.id}/edit`);
  }

  return (
    <div className="text-right space-y-1">
      <div className="flex items-start justify-end gap-6">
        <div>
          <p className="text-xs text-muted-foreground">Our Quote</p>
          <p
            className={cn(
              "text-xl font-semibold",
              negotiated && "text-muted-foreground line-through decoration-1"
            )}
          >
            {formatCurrency(ourAsk)}
          </p>
        </div>
        {negotiated && (
          <div>
            <p className="text-xs text-muted-foreground">Client Agreed</p>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(clientAgreedTotal)}
            </p>
          </div>
        )}
      </div>

      {negotiated && (
        <p className={cn("text-xs", difference < 0 ? "text-red-600" : "text-emerald-600")}>
          Difference: {difference < 0 ? "-" : "+"}
          {formatCurrency(Math.abs(difference))} (
          {ourAsk > 0 ? Math.abs(Math.round((difference / ourAsk) * 1000) / 10) : 0}%)
        </p>
      )}
      {hasLineNegotiation && (
        <p className="text-xs text-muted-foreground">Negotiated per line — see below</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {canRecord && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  {negotiated ? "Update client price" : "Record client price"}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>What did the client agree to?</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="negotiated_amount">Client Agreed (total)</Label>
                  <Input
                    id="negotiated_amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="negotiated_notes">Notes (optional)</Label>
                  <Textarea
                    id="negotiated_notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Who agreed, and anything worth remembering"
                    rows={2}
                    disabled={saving}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canRevise && (
          <Button variant="outline" size="sm" onClick={handleRevise} disabled={revising}>
            {revising ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Create revised quotation
          </Button>
        )}
      </div>
    </div>
  );
}
