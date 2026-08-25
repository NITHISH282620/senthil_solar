"use client";

import { useState } from "react";
import { newRequestKey } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addPayment } from "@/actions/invoices";
import { formatCurrency } from "@/lib/format";

/** Methods that settle through a bank account, and so require one. */
const BANK_METHODS = new Set(["bank_transfer", "cheque"]);

interface PaymentModalProps {
  invoiceId: string;
  balanceDue: number;
  isOpen: boolean;
  onClose: () => void;
  /** The company's bank accounts. Empty is a real state and must be explained. */
  bankAccounts?: { id: string; account_name: string; bank_name: string }[];
}

export function PaymentModal({
  invoiceId,
  balanceDue,
  isOpen,
  onClose,
  bankAccounts = [],
}: PaymentModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // See cash_book.request_key: a receipt that arrives twice is one receipt.
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [amount, setAmount] = useState(balanceDue);
  // Default to the method the company can actually record. Bank transfer is the
  // usual way a corporate client pays, but cash_book refuses a bank entry with
  // no account on file, so offering it first when none exists guarantees a
  // failed submission.
  const [method, setMethod] = useState(
    bankAccounts.length > 0 ? "bank_transfer" : "cash",
  );
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const needsBank = BANK_METHODS.has(method);

  async function handleSubmit(formData: FormData) {
    if (amount <= 0) {
      toast.error("Enter the amount that was received.");
      return;
    }

    if (needsBank && !bankAccountId) {
      toast.error(
        bankAccounts.length === 0
          ? "Add a bank account in Settings before recording a bank transfer or cheque."
          : "Choose which bank account the money arrived in.",
      );
      return;
    }

    setLoading(true);
    formData.set("invoice_id", invoiceId);
    formData.set("bank_account_id", needsBank ? bankAccountId : "");
    formData.set("amount", amount.toString());
    formData.set("payment_method", method);
    formData.set("request_key", requestKey);

    try {
      const result = await addPayment(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        const excess = Math.round((amount - balanceDue) * 100) / 100;
        toast.success(
          excess > 0
            ? `Payment recorded. ₹${excess.toFixed(2)} more than this invoice owed is held as credit for this client.`
            : "Payment recorded successfully",
        );
        setRequestKey(newRequestKey());
        onClose();
        router.refresh();
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a partial or full payment for this invoice.
            <br />
            Balance Due: <strong className="text-foreground">{formatCurrency(balanceDue)}</strong>
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <Input
                type="number"
                step="0.01"
                min={1}
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v || "bank_transfer")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsBank && (
              <div className="space-y-2">
                <Label htmlFor="bank_account_id">Into which account *</Label>
                {bankAccounts.length === 0 ? (
                  <p className="text-sm text-destructive">
                    No bank account on file. Add one in Settings, or record this
                    as cash or UPI.
                  </p>
                ) : (
                  <Select
                    value={bankAccountId}
                    onValueChange={(v) => setBankAccountId(v ?? "")}
                  >
                    <SelectTrigger id="bank_account_id">
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.account_name} — {b.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input
                id="payment_date"
                name="payment_date"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference_number">Reference Number (Optional)</Label>
              <Input
                id="reference_number"
                name="reference_number"
                placeholder="Transaction ID, Cheque No, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || amount <= 0}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
