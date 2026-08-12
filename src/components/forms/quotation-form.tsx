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
} from "@/actions/quotations";
import { formatCurrency } from "@/lib/format";
import type { QuotationWithRelations } from "@/actions/quotations";

interface LineItem {
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface QuotationFormProps {
  quotation?: QuotationWithRelations | null;
  customers: { id: string; name: string; customer_id: string }[];
}

const emptyItem: LineItem = {
  description: "",
  unit: "nos",
  quantity: 1,
  unit_price: 0,
  total_price: 0,
};

export function QuotationForm({ quotation, customers }: QuotationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEdit = !!quotation;

  const [items, setItems] = useState<LineItem[]>(
    quotation?.quotation_items?.map((i) => ({
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.total_price,
    })) ?? [{ ...emptyItem }]
  );

  const [taxPercent, setTaxPercent] = useState(quotation?.tax_percent ?? 18);
  const [discountAmount, setDiscountAmount] = useState(
    quotation?.discount_amount ?? 0
  );

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
  const taxAmount = (subtotal * taxPercent) / 100;
  const totalAmount = subtotal + taxAmount - discountAmount;

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

    // Recalculate total_price
    if (field === "quantity" || field === "unit_price") {
      item.total_price = item.quantity * item.unit_price;
    }

    updated[index] = item;
    setItems(updated);
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    // Validate items
    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      toast.error("At least one line item is required.");
      setLoading(false);
      return;
    }

    const quotationData: Record<string, unknown> = {
      customer_id: formData.get("customer_id") as string,
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      system_capacity_kw: formData.get("system_capacity_kw")
        ? Number(formData.get("system_capacity_kw"))
        : null,
      panel_type: (formData.get("panel_type") as string) || null,
      inverter_type: (formData.get("inverter_type") as string) || null,
      subtotal,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      valid_until: (formData.get("valid_until") as string) || null,
      notes: (formData.get("notes") as string) || null,
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
    router.push("/quotations");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer_id">Customer *</Label>
            <Select
              name="customer_id"
              defaultValue={quotation?.customer_id ?? ""}
              required
              disabled={loading}
            >
              <SelectTrigger id="customer_id">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.customer_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={quotation?.title ?? ""}
              required
              placeholder="e.g., 5kW Rooftop Solar System"
              disabled={loading}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={quotation?.description ?? ""}
              placeholder="Brief description of the quotation"
              rows={2}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="system_capacity_kw">System Capacity (kW)</Label>
            <Input
              id="system_capacity_kw"
              name="system_capacity_kw"
              type="number"
              step="0.01"
              defaultValue={quotation?.system_capacity_kw ?? ""}
              placeholder="e.g., 5.00"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valid_until">Valid Until</Label>
            <Input
              id="valid_until"
              name="valid_until"
              type="date"
              defaultValue={quotation?.valid_until ?? ""}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="panel_type">Panel Type</Label>
            <Input
              id="panel_type"
              name="panel_type"
              defaultValue={quotation?.panel_type ?? ""}
              placeholder="e.g., Mono PERC 545W"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inverter_type">Inverter Type</Label>
            <Input
              id="inverter_type"
              name="inverter_type"
              defaultValue={quotation?.inverter_type ?? ""}
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
                      {formatCurrency(item.total_price)}
                    </TableCell>
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
              </TableBody>
            </Table>
          </div>

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
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
                  className="h-8 w-20 text-right"
                  step="0.01"
                  disabled={loading}
                />
                <span className="font-medium w-24 text-right">
                  {formatCurrency(taxAmount)}
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
                <span>Total</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
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
            name="notes"
            defaultValue={quotation?.notes ?? ""}
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
