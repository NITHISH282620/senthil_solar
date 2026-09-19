"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createQuotation,
  updateQuotation,
  recordLineNegotiation,
} from "@/actions/quotations";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuotationWithRelations } from "@/actions/quotations";

interface LineItem {
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface QuotationFormProps {
  quotation?: QuotationWithRelations | null;
  companies: { id: string; name: string; company_code: string }[];
  /**
   * Present when this quotation is being created for a specific site (from
   * the site's own page) — locks the company to the site's client and
   * carries site_id through so the quotation is linked back to it.
   */
  lockedSite?: { id: string; name: string; company_id: string; company_name: string } | null;
}

const emptyItem: LineItem = {
  description: "",
  unit: "nos",
  quantity: 1,
  unit_price: 0,
  line_total: 0,
};

/**
 * Every field here is now React state read directly at submit time — none of
 * it goes through FormData off the DOM.
 *
 * The previous version mixed the two: `items` was controlled React state,
 * but title/description/capacity/dates/panel/inverter were plain uncontrolled
 * inputs read via `new FormData(form)` when `<form action={handleSubmit}>`
 * fired. That combination submitted a form whose `items` state said one thing
 * and whose live DOM occasionally said another — reported as "at least one
 * line item is required" even after typing one, because the check ran against
 * whatever `items` closure the action still held rather than the field the
 * user was looking at. Reading every field from the same state that renders
 * it removes the two things that made that possible: no native FormData
 * snapshot, and no `action` prop for React to manage a reset around.
 */
export function QuotationForm({ quotation, companies, lockedSite }: QuotationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEdit = !!quotation;

  const [items, setItems] = useState<LineItem[]>(
    quotation?.quotation_items?.map((i) => ({
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: i.line_total ?? 0,
    })) ?? [{ ...emptyItem }]
  );

  const [companyId, setCompanyId] = useState(
    quotation?.company_id ?? lockedSite?.company_id ?? ""
  );
  const [title, setTitle] = useState(quotation?.title ?? "");
  const [description, setDescription] = useState(quotation?.description ?? "");
  const [capacityKw, setCapacityKw] = useState(
    quotation?.capacity_kw != null ? String(quotation.capacity_kw) : ""
  );
  const [validFrom, setValidFrom] = useState(quotation?.valid_from ?? "");
  const [validUntil, setValidUntil] = useState(quotation?.valid_until ?? "");
  const [panelType, setPanelType] = useState(quotation?.panel_type ?? "");
  const [inverterType, setInverterType] = useState(quotation?.inverter_type ?? "");
  const [notes, setNotes] = useState(quotation?.notes ?? "");

  const [gstPercent, setGstPercent] = useState(quotation?.gst_percent ?? 18);
  const [discountAmount, setDiscountAmount] = useState(
    quotation?.discount_amount ?? 0
  );

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const gstAmount = (subtotal * gstPercent) / 100;
  const totalAmount = subtotal + gstAmount - discountAmount;

  // What the client actually agreed to, tracked separately from the ask.
  // Editing the ask itself is still only this form's job (Unit Price below)
  // — Sanctioned is saved through its own call (recordLineNegotiation) the
  // moment a row is edited, never through the main "Update Quotation"
  // submit, so the two business events (owner re-pricing vs. client
  // agreeing) never share one save path.
  const negotiatedAmount = quotation?.client_agreed_total ?? quotation?.negotiated_amount ?? null;
  const negotiatedVariance =
    negotiatedAmount != null && negotiatedAmount !== totalAmount
      ? negotiatedAmount - totalAmount
      : null;

  // Sanctioned/Difference are usable once a client price could exist at
  // all (sent or approved) — not only once one already does, so this is
  // also where the FIRST per-line figure gets recorded.
  const canSanction =
    !!quotation && (quotation.status === "sent" || quotation.status === "approved");
  // A lump-sum client figure was never broken out per line — apportioning it
  // by each line's share of the ask is the only way to show it against work,
  // but it's a display split, not a recorded per-line agreement, so it's
  // marked with * until the owner overrides that specific line.
  const lumpSumRatio =
    negotiatedVariance != null && !quotation?.has_line_negotiation && quotation?.our_total
      ? (quotation.client_agreed_total ?? quotation.our_total) / quotation.our_total
      : null;

  function lineComparison(index: number) {
    const stored = quotation?.quotation_items?.[index];
    if (!stored) return null;
    if (stored.client_unit_price != null) {
      const sanctioned = stored.client_line_total ?? stored.line_total ?? 0;
      return { sanctioned, difference: sanctioned - (stored.line_total ?? 0), apportioned: false };
    }
    if (lumpSumRatio != null) {
      const ourLine = stored.line_total ?? 0;
      const sanctioned = Math.round(ourLine * lumpSumRatio * 100) / 100;
      return { sanctioned, difference: sanctioned - ourLine, apportioned: true };
    }
    return null;
  }

  const [sanctionDrafts, setSanctionDrafts] = useState<Record<number, string>>({});
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  /**
   * The client agreed to *something* for every line — either what was
   * actually recorded (or apportioned) for it, or, absent that, the ask
   * itself (the same fallback v_quotation_totals uses). Never blank/zero:
   * an unset row reads as "not negotiated, so assume the ask," not as
   * "the client agreed to pay nothing for this."
   */
  function sanctionDraftValue(index: number) {
    if (index in sanctionDrafts) return sanctionDrafts[index];
    const cmp = lineComparison(index);
    if (cmp) return String(cmp.sanctioned);
    const stored = quotation?.quotation_items?.[index];
    return stored ? String(stored.line_total ?? 0) : "";
  }

  async function saveSanction(index: number) {
    const stored = quotation?.quotation_items?.[index];
    const draft = sanctionDrafts[index];
    if (!stored || draft == null) return;

    const sanctionedTotal = Number(draft);
    if (!Number.isFinite(sanctionedTotal) || sanctionedTotal < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    // Sanctioned here is the line's total; the action stores a unit price.
    const clientUnitPrice = stored.quantity > 0 ? sanctionedTotal / stored.quantity : 0;

    setSavingIndex(index);
    const result = await recordLineNegotiation(stored.id, clientUnitPrice);
    setSavingIndex(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSanctionDrafts((d) => {
      const next = { ...d };
      delete next[index];
      return next;
    });
    toast.success("Sanctioned amount recorded for this line.");
    router.refresh();
  }

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...items];
    const item = { ...updated[index] };

    if (field === "description" || field === "unit") {
      item[field] = value as string;
    } else {
      item[field] = Number(value) || 0;
    }

    // Recalculate line_total
    if (field === "quantity" || field === "unit_price") {
      item.line_total = item.quantity * item.unit_price;
    }

    updated[index] = item;
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!companyId) {
      toast.error("Choose the client this quotation is for.");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the quotation a title.");
      return;
    }

    // Validate items
    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      toast.error("At least one line item is required.");
      return;
    }

    if (validFrom && validUntil && validUntil < validFrom) {
      toast.error("Valid until cannot be before valid from.");
      return;
    }

    setLoading(true);

    const quotationData: Record<string, unknown> = {
      company_id: companyId,
      site_id: lockedSite?.id ?? quotation?.site_id ?? null,
      title: title.trim(),
      description: description.trim() || null,
      capacity_kw: capacityKw ? Number(capacityKw) : null,
      panel_type: panelType.trim() || null,
      inverter_type: inverterType.trim() || null,
      subtotal,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
    };

    const itemsPayload = validItems.map((item, index) => ({
      ...item,
      sort_order: index,
    }));

    let result;
    if (isEdit) {
      result = await updateQuotation(quotation.id, quotationData, itemsPayload);
    } else {
      result = await createQuotation(quotationData, itemsPayload);
    }

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success(
      isEdit
        ? "Quotation updated successfully"
        : "Quotation created successfully"
    );
    router.push(lockedSite ? `/sites/${lockedSite.id}` : "/quotations");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {lockedSite ? (
            <div className="space-y-2">
              <Label>Site</Label>
              <p className="text-sm font-medium">
                {lockedSite.name}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  — {lockedSite.company_name}
                </span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="company_id">Company *</Label>
              <Select
                value={companyId}
                onValueChange={(v) => setCompanyId(v ?? "")}
                disabled={loading}
              >
                <SelectTrigger id="company_id">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.company_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 5kW Rooftop Solar System"
              disabled={loading}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the quotation"
              rows={2}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity_kw">System Capacity (kW)</Label>
            <Input
              id="capacity_kw"
              type="number"
              step="0.001"
              value={capacityKw}
              onChange={(e) => setCapacityKw(e.target.value)}
              placeholder="e.g., 5.00"
              disabled={loading}
            />
          </div>

          {/* Validity is a window, not just an expiry — a price can be locked
              in only from a given start date (a seasonal rate, a bulk-material
              price held for a window), so an expiry date alone cannot say
              that. Valid From defaults to nothing, meaning effective
              immediately, which matches the old single-date behaviour. */}
          <div className="space-y-2">
            <Label htmlFor="valid_from">Valid From</Label>
            <Input
              id="valid_from"
              type="date"
              value={validFrom ?? ""}
              max={validUntil || undefined}
              onChange={(e) => setValidFrom(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valid_until">Valid Until</Label>
            <Input
              id="valid_until"
              type="date"
              value={validUntil ?? ""}
              min={validFrom || undefined}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="panel_type">Panel Type</Label>
            <Input
              id="panel_type"
              value={panelType ?? ""}
              onChange={(e) => setPanelType(e.target.value)}
              placeholder="e.g., Mono PERC 545W"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inverter_type">Inverter Type</Label>
            <Input
              id="inverter_type"
              value={inverterType ?? ""}
              onChange={(e) => setInverterType(e.target.value)}
              placeholder="e.g., Growatt 5kW"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={loading}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="w-[80px]">Unit</TableHead>
                  <TableHead className="w-[80px]">Qty</TableHead>
                  <TableHead className="w-[120px]">Unit Price</TableHead>
                  <TableHead className="w-[120px] text-right">Total</TableHead>
                  {canSanction && (
                    <>
                      <TableHead className="w-[130px] text-right">Sanctioned</TableHead>
                      <TableHead className="w-[120px] text-right">Difference</TableHead>
                    </>
                  )}
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                        placeholder="Item description"
                        disabled={loading}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          updateItem(index, "unit", e.target.value)
                        }
                        disabled={loading}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, "quantity", e.target.value)
                        }
                        min={0}
                        step="0.01"
                        disabled={loading}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(index, "unit_price", e.target.value)
                        }
                        min={0}
                        step="0.01"
                        disabled={loading}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.line_total)}
                    </TableCell>
                    {canSanction && (() => {
                      const stored = quotation?.quotation_items?.[index];
                      const cmp = lineComparison(index);
                      const draftRaw = sanctionDraftValue(index);
                      const draftNum = Number(draftRaw);
                      const liveDiff = stored && Number.isFinite(draftNum)
                        ? draftNum - (stored.line_total ?? 0)
                        : cmp?.difference ?? null;

                      return (
                        <>
                          <TableCell className="text-right">
                            {stored ? (
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={draftRaw}
                                  onChange={(e) =>
                                    setSanctionDrafts((d) => ({ ...d, [index]: e.target.value }))
                                  }
                                  onBlur={() => {
                                    if (index in sanctionDrafts) saveSanction(index);
                                  }}
                                  disabled={savingIndex === index}
                                  className="h-8 w-24 text-right"
                                />
                                {savingIndex === index && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                )}
                                {cmp?.apportioned && !(index in sanctionDrafts) && (
                                  <span className="text-muted-foreground">*</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right text-sm",
                              liveDiff != null && liveDiff < 0 && "text-red-600",
                              liveDiff != null && liveDiff > 0 && "text-emerald-600"
                            )}
                          >
                            {liveDiff != null ? formatCurrency(liveDiff) : "—"}
                          </TableCell>
                        </>
                      );
                    })()}
                    <TableCell>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                          disabled={loading}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {canSanction && (() => {
                  let totalSanctioned = 0;
                  let anySanctioned = false;
                  items.forEach((_, index) => {
                    const stored = quotation?.quotation_items?.[index];
                    if (!stored) return;
                    const draftRaw = sanctionDraftValue(index);
                    const draftNum = Number(draftRaw);
                    if (Number.isFinite(draftNum)) {
                      totalSanctioned += draftNum;
                      anySanctioned = true;
                    }
                  });
                  const totalDiff = anySanctioned ? totalSanctioned - subtotal : null;

                  return (
                    <TableRow className="font-bold">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right">{formatCurrency(subtotal)}</TableCell>
                      <TableCell className="text-right">
                        {anySanctioned ? formatCurrency(totalSanctioned) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          totalDiff != null && totalDiff < 0 && "text-red-600",
                          totalDiff != null && totalDiff > 0 && "text-emerald-600"
                        )}
                      >
                        {totalDiff != null ? formatCurrency(totalDiff) : "—"}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
          {lumpSumRatio != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              * The client agreed one total figure, not itemized per line — this is that
              amount split across lines by their share of the ask, not a per-line agreement.
              Record what they actually said per line from the quotation&apos;s own page for
              an exact breakdown instead.
            </p>
          )}

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-muted-foreground">Tax (%)</span>
                <Input
                  type="number"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(Number(e.target.value) || 0)}
                  className="h-8 w-20 text-right"
                  step="0.01"
                  disabled={loading}
                />
                <span className="font-medium w-24 text-right">
                  {formatCurrency(gstAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-muted-foreground">Discount</span>
                <Input
                  type="number"
                  value={discountAmount}
                  onChange={(e) =>
                    setDiscountAmount(Number(e.target.value) || 0)
                  }
                  className="h-8 w-20 text-right"
                  step="0.01"
                  disabled={loading}
                />
                <span className="font-medium w-24 text-right">
                  -{formatCurrency(discountAmount)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>{negotiatedAmount != null ? "Our Total" : "Total"}</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
              {negotiatedAmount != null && (
                <div className="flex justify-between text-base font-bold">
                  <span className="font-normal text-muted-foreground">
                    Client Agreed
                  </span>
                  <span className="text-primary">
                    {formatCurrency(negotiatedAmount)}
                  </span>
                </div>
              )}
              {negotiatedVariance != null && negotiatedVariance !== 0 && (
                <div
                  className={cn(
                    "text-right text-xs",
                    negotiatedVariance < 0 ? "text-red-600" : "text-emerald-600"
                  )}
                >
                  {negotiatedVariance < 0 ? "↓ " : "↑ "}
                  {formatCurrency(Math.abs(negotiatedVariance))}
                  {totalAmount
                    ? ` (${Math.abs(Math.round((negotiatedVariance / totalAmount) * 1000) / 10)}%)`
                    : ""}{" "}
                  vs. our total
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Terms, conditions, or internal notes"
            rows={3}
            disabled={loading}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <Separator />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEdit ? "Updating..." : "Creating..."}
            </>
          ) : isEdit ? (
            "Update Quotation"
          ) : (
            "Create Quotation"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
