"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { createInvoice } from "@/actions/invoices";
import { formatCurrency } from "@/lib/format";

interface InvoiceItemInput {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceFormProps {
  companies: { id: string; name: string; company_code: string }[];
  contracts?: { id: string; contract_number: string; title: string }[];
  defaultGstRate?: number;
  prefilledContractId?: string;
  prefilledCompanyId?: string;
}

export function InvoiceForm({
  companies,
  contracts = [],
  defaultGstRate = 18,
  prefilledContractId,
  prefilledCompanyId,
}: InvoiceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState(prefilledCompanyId || "");
  const [contractId, setContractId] = useState(prefilledContractId || "");
  
  const initialItems: InvoiceItemInput[] = [
    { id: crypto.randomUUID(), description: "", unit: "nos", quantity: 1, unit_price: 0 },
  ];
  
  const [items, setItems] = useState<InvoiceItemInput[]>(initialItems);
  const [gstPercent, setGstPercent] = useState<number>(defaultGstRate);
  const [discount, setDiscount] = useState<number>(0);

  const subtotal = items.reduce((acc, item) => acc + (item.quantity || 0) * (item.unit_price || 0), 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  // For simplicity here, assuming intra-state (CGST + SGST)
  const gstAmount = (taxableAmount * gstPercent) / 100;
  const totalAmount = taxableAmount + gstAmount;

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), description: "", unit: "nos", quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof InvoiceItemInput, value: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  async function handleSubmit(formData: FormData) {
    // Validate items
    const validItems = items.filter((item) => item.description.trim() !== "");
    if (validItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }
    
    if (!companyId) {
      toast.error("Please select a customer");
      return;
    }

    setLoading(true);

    try {
      formData.set("company_id", companyId);
      if (contractId) formData.set("contract_id", contractId);
      formData.set("gst_percent", gstPercent.toString());
      formData.set("discount_amount", discount.toString());
      formData.set("items", JSON.stringify(validItems));

      const result = await createInvoice(formData);

      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not create invoice.");
      } else {
        toast.success("Invoice created successfully");
        router.push(`/billing/${result.data.id}`);
        router.refresh();
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Select value={companyId} onValueChange={(v) => setCompanyId(v || "")} required>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label htmlFor="contract">Linked Contract</Label>
              <Select value={contractId} onValueChange={(v) => setContractId(v || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contract (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contract_number} - {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-md">Description</th>
                  <th className="px-4 py-3 font-medium w-24">Unit</th>
                  <th className="px-4 py-3 font-medium w-24 text-right">Qty</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Unit Price</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Total</th>
                  <th className="px-4 py-3 font-medium w-12 rounded-tr-md"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2">
                      <Input
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        required
                        className="bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background transition-colors"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        placeholder="Unit"
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                        className="bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background transition-colors"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                        className="text-right bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background transition-colors"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                        className="text-right bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background transition-colors"
                      />
                    </td>
                    <td className="p-2 text-right font-medium">
                      {formatCurrency((item.quantity || 0) * (item.unit_price || 0))}
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="p-4 border rounded-xl bg-card space-y-4 relative">
                <div className="absolute top-2 right-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">Item {index + 1}</h4>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                    <Input
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, "description", e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Unit</Label>
                      <Input
                        placeholder="Unit"
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Unit Price</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  
                  <div className="pt-2 border-t flex justify-between items-center">
                    <span className="text-sm font-medium text-muted-foreground">Item Total</span>
                    <span className="font-semibold">{formatCurrency((item.quantity || 0) * (item.unit_price || 0))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full md:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>

          {/* Totals Section */}
          <div className="flex flex-col items-end pt-6 border-t space-y-4">
            <div className="w-full md:w-64 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  Discount
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="w-24 h-7 text-right"
                />
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  Tax (%)
                </span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(parseFloat(e.target.value) || 0)}
                  className="w-20 h-7 text-right"
                />
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Tax Amount</span>
                <span>{formatCurrency(gstAmount)}</span>
              </div>
              
              <div className="pt-3 border-t flex justify-between items-center">
                <span className="font-semibold text-base">Total</span>
                <span className="font-bold text-lg text-primary">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes / Terms & Conditions</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Payment terms, warranty info, etc."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Invoice
        </Button>
      </div>
    </form>
  );
}
