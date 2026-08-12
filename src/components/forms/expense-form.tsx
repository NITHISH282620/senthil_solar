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
import { createExpense } from "@/actions/expenses";
import { formatCurrency } from "@/lib/format";

interface ExpenseItemInput {
  id: string;
  description: string;
  amount: number;
}

interface ExpenseFormProps {
  workOrders?: { id: string; work_order_number: string; title: string }[];
}

export function ExpenseForm({ workOrders = [] }: ExpenseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("materials");
  const [workOrderId, setWorkOrderId] = useState("");
  
  const [items, setItems] = useState<ExpenseItemInput[]>([
    { id: crypto.randomUUID(), description: "", amount: 0 },
  ]);

  const totalAmount = items.reduce((acc, item) => acc + (item.amount || 0), 0);

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), description: "", amount: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof ExpenseItemInput, value: string | number) => {
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
    const validItems = items.filter((item) => item.description.trim() !== "" && item.amount > 0);
    if (validItems.length === 0) {
      toast.error("Please add at least one valid expense item");
      return;
    }

    setLoading(true);

    try {
      formData.set("category", category);
      if (workOrderId && workOrderId !== "none") {
        formData.set("work_order_id", workOrderId);
      }
      formData.set("items", JSON.stringify(validItems));

      const result = await createExpense(formData);

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Expense submitted successfully");
        router.push(`/expenses/${(result as any).data.id}`);
        router.refresh();
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title / Summary *</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Cables and connectors for Site A"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v || "materials")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="materials">Materials</SelectItem>
                  <SelectItem value="tools">Tools</SelectItem>
                  <SelectItem value="meals">Meals</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workOrder">Link to Work Order (Optional)</Label>
              <Select value={workOrderId} onValueChange={(v) => setWorkOrderId(v || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select work order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {workOrders.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.work_order_number} - {wo.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Additional details about the expense..."
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1 w-full space-y-1">
                  {index === 0 && <Label className="hidden sm:block text-xs text-muted-foreground">Description</Label>}
                  <Input
                    placeholder="Item description"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    required
                  />
                </div>
                
                <div className="w-full sm:w-32 space-y-1">
                  {index === 0 && <Label className="hidden sm:block text-xs text-muted-foreground">Amount</Label>}
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    value={item.amount || ""}
                    onChange={(e) => updateItem(item.id, "amount", parseFloat(e.target.value) || 0)}
                    className="text-right"
                    required
                  />
                </div>
                
                <div className={`pt-2 sm:pt-0 ${index === 0 ? 'sm:mt-5' : ''}`}>
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
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between border-t pt-4">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
            
            <div className="flex items-center gap-4 text-right">
              <span className="text-sm font-medium text-muted-foreground">Total Amount</span>
              <span className="text-lg font-bold">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Expense
        </Button>
      </div>
    </form>
  );
}
