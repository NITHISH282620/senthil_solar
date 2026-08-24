"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { issueInvoice, cancelInvoice } from "@/actions/invoices";

interface InvoiceActionsProps {
  invoiceId: string;
  currentStatus: string;
  amountReceived: number;
  userRole: string;
}

/**
 * Moving an invoice out of 'draft' had no control anywhere in the app, so
 * every invoice stayed a draft — and receivables ageing, the outstanding
 * total and the overdue count all skip drafts. The owner could raise a
 * hundred invoices and still be told nobody owed him anything.
 */
export function InvoiceActions({
  invoiceId,
  currentStatus,
  amountReceived,
  userRole,
}: InvoiceActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const canIssue = ["owner", "manager", "accountant"].includes(userRole);
  const canCancel = ["owner", "manager"].includes(userRole);

  async function handleIssue() {
    setLoading("issue");
    const { error } = await issueInvoice(invoiceId);
    if (error) toast.error(error);
    else {
      toast.success("Invoice issued. It now counts towards outstanding money.");
      router.refresh();
    }
    setLoading(null);
  }

  async function handleCancel() {
    const reason = window.prompt("Why is this invoice being cancelled?");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }

    setLoading("cancel");
    const { error } = await cancelInvoice(invoiceId, reason);
    if (error) toast.error(error);
    else {
      toast.success("Invoice cancelled.");
      router.refresh();
    }
    setLoading(null);
  }

  return (
    <>
      {currentStatus === "draft" && canIssue && (
        <Button variant="default" size="sm" onClick={handleIssue} disabled={loading !== null}>
          {loading === "issue" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Issue to client
        </Button>
      )}

      {currentStatus !== "cancelled" &&
        currentStatus !== "paid" &&
        amountReceived === 0 &&
        canCancel && (
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading !== null}>
            {loading === "cancel" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Cancel
          </Button>
        )}
    </>
  );
}
