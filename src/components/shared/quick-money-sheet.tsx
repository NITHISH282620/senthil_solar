"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { createCashEntry } from "@/actions/cash-book";
import type { SiteOption } from "@/actions/sites";

interface QuickMoneySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which direction the sheet opens on. The owner can still flip it. */
  defaultDirection?: "in" | "out";
  /** Preselects the category, e.g. opening straight into a worker advance. */
  defaultCategory?: string;
  sites: SiteOption[];
  categories: { code: string; label: string; icon: string | null }[];
  workers: { id: string; full_name: string }[];
  /** Locks the entry to one site, e.g. when opened from a site page. */
  lockedSiteId?: string;
}

/** Taps beat typing. These cover the overwhelming majority of daily entries. */
const AMOUNT_PRESETS = [20, 50, 100, 200, 500, 1000];

export function QuickMoneySheet({
  open,
  onOpenChange,
  defaultDirection = "out",
  defaultCategory,
  sites,
  categories,
  workers,
  lockedSiteId,
}: QuickMoneySheetProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [direction, setDirection] = useState<"in" | "out">(defaultDirection);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [siteId, setSiteId] = useState(lockedSiteId ?? "");
  const [isOffice, setIsOffice] = useState(false);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [employeeId, setEmployeeId] = useState("");
  const [description, setDescription] = useState("");

  const needsWorker = category === "worker_advance";
  const numericAmount = Number(amount) || 0;

  const selectedCategory = useMemo(
    () => categories.find((c) => c.code === category),
    [categories, category]
  );

  function reset() {
    setAmount("");
    setCategory(defaultCategory ?? "");
    setEmployeeId("");
    setDescription("");
    setIsOffice(false);
    if (!lockedSiteId) setSiteId("");
  }

  async function handleSubmit() {
    if (numericAmount <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    if (!category) {
      toast.error("Pick a category.");
      return;
    }
    if (!isOffice && !siteId) {
      toast.error("Pick a site, or mark it as an office expense.");
      return;
    }
    if (needsWorker && !employeeId) {
      toast.error("Choose which worker received the advance.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.set("direction", direction);
    formData.set("amount", String(numericAmount));
    formData.set("category", category);
    formData.set("payment_mode", paymentMode);
    formData.set("site_id", isOffice ? "" : siteId);
    if (isOffice) formData.set("is_office", "on");
    if (employeeId) formData.set("employee_id", employeeId);
    // A blank note is the norm at Rs 20; fall back to the category label so
    // the ledger never shows an unexplained line.
    formData.set(
      "description",
      description.trim() || selectedCategory?.label || "Cash entry"
    );

    const { error } = await createCashEntry(formData);

    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }

    toast.success(
      `${direction === "in" ? "Received" : "Paid"} ${formatCurrency(numericAmount)}`
    );
    reset();
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Quick entry</SheetTitle>
          <SheetDescription>
            Record money as it moves. Nothing is too small.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          {/* Direction — big targets, thumb-reachable */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection("out")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border-2 py-4 text-sm font-semibold transition-colors",
                direction === "out"
                  ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                  : "border-border text-muted-foreground"
              )}
            >
              <ArrowUpRight className="h-5 w-5" />
              Money Out
            </button>
            <button
              type="button"
              onClick={() => setDirection("in")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border-2 py-4 text-sm font-semibold transition-colors",
                direction === "in"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-border text-muted-foreground"
              )}
            >
              <ArrowDownLeft className="h-5 w-5" />
              Money In
            </button>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="quick-amount">Amount</Label>
            <Input
              id="quick-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              autoFocus
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-14 text-2xl font-semibold"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  ₹{preset}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="What was this for?" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.icon ? `${c.icon}  ` : ""}
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Worker — only when the category implies one */}
          {needsWorker && (
            <div className="space-y-2">
              <Label>Worker</Label>
              <Select value={employeeId} onValueChange={(v) => setEmployeeId(v ?? "")}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Who received it?" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Recorded against their advance balance and recovered at payroll.
              </p>
            </div>
          )}

          {/* Site */}
          {!lockedSiteId && (
            <div className="space-y-2">
              <Label>Site</Label>
              <Select
                value={isOffice ? "__office__" : siteId}
                onValueChange={(value) => {
                  const v = value ?? "";
                  if (v === "__office__") {
                    setIsOffice(true);
                    setSiteId("");
                  } else {
                    setIsOffice(false);
                    setSiteId(v);
                  }
                }}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Which site?" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.company_name ? ` — ${s.company_name}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="__office__">Office / not site work</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payment mode */}
          <div className="space-y-2">
            <Label>Paid by</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["cash", "upi", "bank", "card"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={cn(
                    "rounded-lg border py-2.5 text-sm capitalize transition-colors",
                    paymentMode === mode
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Note — optional by design */}
          <div className="space-y-2">
            <Label htmlFor="quick-note">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="quick-note"
              placeholder={selectedCategory?.label ?? "Anything worth remembering"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="h-14 w-full text-base"
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            {numericAmount > 0
              ? `Save ${formatCurrency(numericAmount)}`
              : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
