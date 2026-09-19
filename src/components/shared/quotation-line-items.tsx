"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recordLineNegotiation } from "@/actions/quotations";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuotationItem } from "@/types/database";

interface QuotationLineItemsProps {
  items: QuotationItem[];
  /** Whether a client price can still be recorded — quotation is sent or approved. */
  canNegotiate: boolean;
}

/**
 * Our Quote / Client Agreed / Difference, per line — the comparison the
 * owner's real negotiations actually need ("Field work 8,000" while civil
 * work is untouched). client_unit_price never overwrites unit_price; a
 * line with no client figure yet falls back to its own line_total, per
 * v_quotation_totals' rule.
 */
export function QuotationLineItems({ items, canNegotiate }: QuotationLineItemsProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(item: QuotationItem) {
    setEditingId(item.id);
    setDraft(
      item.client_unit_price != null ? String(item.client_unit_price) : String(item.unit_price)
    );
  }

  async function save(itemId: string) {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter a valid price.");
      return;
    }
    setSaving(true);
    const result = await recordLineNegotiation(itemId, parsed);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Client price recorded for this line.");
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Our Quote</TableHead>
            <TableHead className="text-right">Client Agreed</TableHead>
            <TableHead className="text-right">Difference</TableHead>
            {canNegotiate && <TableHead className="w-[40px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const agreed = item.client_line_total ?? item.line_total ?? 0;
            const ourTotal = item.line_total ?? 0;
            const diff = agreed - ourTotal;
            const isEditing = editingId === item.id;

            return (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{item.description}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(ourTotal)}</TableCell>
                <TableCell className="text-right">
                  {isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={saving}
                        className="h-8 w-28 text-right"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span
                      className={cn(
                        item.client_unit_price != null && diff !== 0 && "font-medium"
                      )}
                    >
                      {formatCurrency(agreed)}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-sm",
                    diff < 0 && "text-red-600",
                    diff > 0 && "text-emerald-600"
                  )}
                >
                  {diff !== 0 ? formatCurrency(diff) : "₹0"}
                </TableCell>
                {canNegotiate && (
                  <TableCell>
                    {isEditing ? (
                      <Button size="sm" onClick={() => save(item.id)} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => startEdit(item)}
                        title="Record client price for this line"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
