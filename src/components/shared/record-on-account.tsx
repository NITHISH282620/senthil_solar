"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Coins } from "lucide-react";
import { toast } from "sonner";
import { recordClientCredit } from "@/actions/invoices";
import { newRequestKey } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

const BANK_METHODS = new Set(["bank_transfer", "cheque"]);

/**
 * Client money arriving with no invoice to put it against — an advance before
 * the work is billed, or more than the last bill after it was settled. Both are
 * ordinary, and both had nowhere to go: addPayment refuses a settled invoice
 * and the Record Payment button disables at a zero balance, so the money sat in
 * the bank while the books denied it.
 */
export function RecordOnAccount({
  companyId,
  companyName,
  bankAccounts = [],
}: {
  companyId: string;
  companyName: string;
  bankAccounts?: { id: string; account_name: string; bank_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState(
    bankAccounts.length > 0 ? "bank_transfer" : "cash",
  );
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [requestKey, setRequestKey] = useState(newRequestKey);

  const needsBank = BANK_METHODS.has(method);

  async function handleSubmit(formData: FormData) {
    if (amount <= 0) {
      toast.error("Enter the amount that was received.");
      return;
    }
    if (needsBank && !bankAccountId) {
      toast.error(
        bankAccounts.length === 0
          ? "Add a bank account in Settings first."
          : "Choose which bank account the money arrived in.",
      );
      return;
    }

    setLoading(true);
    formData.set("company_id", companyId);
    formData.set("amount", String(amount));
    formData.set("payment_method", method);
    formData.set("bank_account_id", needsBank ? bankAccountId : "");
    formData.set("request_key", requestKey);

    const { error } = await recordClientCredit(formData);
    setLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(
      `${formatCurrency(amount)} held on account for ${companyName}.`,
    );
    setRequestKey(newRequestKey());
    setAmount(0);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Coins className="mr-2 h-4 w-4" />
        Money on account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record money on account</DialogTitle>
            <DialogDescription>
              Money from {companyName} that no invoice is claiming yet — an
              advance, or more than the last bill. It stays visible as credit
              until you set it against an invoice.
            </DialogDescription>
          </DialogHeader>

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oa_amount">Amount (₹)</Label>
              <Input
                id="oa_amount"
                type="number"
                step="0.01"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>How it arrived</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? method)}>
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
                <Label>Into which account</Label>
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
                    <SelectTrigger>
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
              <Label htmlFor="oa_date">Date received</Label>
              <Input id="oa_date" name="payment_date" type="date" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oa_ref">Reference</Label>
              <Input id="oa_ref" name="reference_number" placeholder="UTR / cheque no." />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}
                disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || amount <= 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Hold on account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
