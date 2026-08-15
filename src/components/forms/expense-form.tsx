"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

interface ExpenseFormProps {
  /** From expense_categories, so custom categories appear without a rebuild. */
  categories: { code: string; label: string; icon: string | null }[];
  sites: { id: string; name: string; company_name: string | null }[];
}

export function ExpenseForm({ categories, sites }: ExpenseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [siteId, setSiteId] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    try {
      if (!category) {
        toast.error("Pick a category.");
        setLoading(false);
        return;
      }
      formData.set("category", category);
      // Site attribution is what makes the cost reach site profitability.
      formData.set("site_id", siteId);

      const result = await createExpense(formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Expense submitted successfully");
        router.push(`/expenses`);
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
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "")} disabled={loading}>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹) *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min={0}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="site_id">Site</Label>
              <Select value={siteId} onValueChange={(v) => setSiteId(v ?? "")} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Which site?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not site work</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.company_name ? ` — ${s.company_name}` : ""}
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
                placeholder="Additional details..."
                rows={3}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Expense"
          )}
        </Button>
      </div>
    </form>
  );
}
