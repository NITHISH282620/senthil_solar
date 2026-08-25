"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Landmark, Plus } from "lucide-react";
import { toast } from "sonner";
import { createBankAccount, deactivateBankAccount } from "@/actions/bank-accounts";
import type { BankAccount } from "@/types/database";

/**
 * The company's bank accounts.
 *
 * cash_book refuses an entry whose payment_mode is 'bank' without one, so until
 * this existed no payment by bank transfer or cheque could be recorded at all —
 * and bank transfer is how corporate clients pay.
 */
export function BankAccounts({ accounts }: { accounts: BankAccount[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState("current");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.set("account_type", accountType);
    const { error } = await createBankAccount(formData);
    setLoading(false);

    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Bank account added.");
    setAdding(false);
    router.refresh();
  }

  async function retire(id: string, name: string) {
    if (!window.confirm(`Retire ${name}? Past entries keep pointing at it.`)) return;
    const { error } = await deactivateBankAccount(id);
    if (error) toast.error(error);
    else {
      toast.success("Account retired.");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Bank accounts</CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {accounts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No accounts yet. Money received or paid by bank transfer or cheque
            cannot be recorded until one exists.
          </p>
        )}

        {accounts.length > 0 && (
          <div className="divide-y rounded-md border">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    {a.account_name}
                    {a.is_primary ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        primary
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.bank_name} · ****{a.account_number.slice(-4)} · {a.ifsc}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => retire(a.id, a.account_name)}
                >
                  Retire
                </Button>
              </div>
            ))}
          </div>
        )}

        {adding && (
          <form action={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account_name">Account name *</Label>
              <Input id="account_name" name="account_name" required
                placeholder="Sentil Solar Current A/c" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank *</Label>
              <Input id="bank_name" name="bank_name" required
                placeholder="HDFC Bank" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_number">Account number *</Label>
              <Input id="account_number" name="account_number" required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ifsc">IFSC *</Label>
              <Input id="ifsc" name="ifsc" required placeholder="HDFC0001234"
                className="uppercase" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Input id="branch" name="branch" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_type_trigger">Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v ?? "current")}>
                <SelectTrigger id="account_type_trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="od">Overdraft</SelectItem>
                  <SelectItem value="cc">Cash credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="opening_balance">Opening balance (₹)</Label>
              <Input id="opening_balance" name="opening_balance" type="number"
                step="0.01" defaultValue={0} disabled={loading} />
            </div>
            <div className="flex items-end gap-2">
              <Checkbox id="is_primary" name="is_primary" />
              <Label htmlFor="is_primary" className="font-normal">
                Use as the default account
              </Label>
            </div>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save account
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}
                disabled={loading}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
