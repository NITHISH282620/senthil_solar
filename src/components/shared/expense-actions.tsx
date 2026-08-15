"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { updateExpenseStatus } from "@/actions/expenses";

interface ExpenseActionsProps {
  expenseId: string;
  currentStatus: string;
}

export function ExpenseActions({
  expenseId,
  currentStatus,
}: ExpenseActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function handleStatusChange(newStatus: string, rejectionReason?: string) {
    setLoading(newStatus);
    const result = await updateExpenseStatus(expenseId, newStatus, rejectionReason);

    if (result.error) {
      toast.error(result.error);
      setLoading(null);
      return;
    }

    toast.success(
      newStatus === "approved" ? "Expense approved" : "Expense rejected"
    );
    setRejecting(false);
    setReason("");
    setLoading(null);
    router.refresh();
  }

  if (currentStatus !== "pending") return null;

  // Rejection needs a reason: the table has a check constraint requiring one,
  // and the person who submitted it deserves to know why.
  if (rejecting) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this rejected?"
          className="w-64"
        />
        <Button
          variant="destructive"
          size="sm"
          disabled={loading !== null || !reason.trim()}
          onClick={() => handleStatusChange("rejected", reason.trim())}
        >
          {loading === "rejected" && (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          )}
          Confirm rejection
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRejecting(false);
            setReason("");
          }}
          disabled={loading !== null}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => handleStatusChange("approved")}
        disabled={loading !== null}
        className="bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {loading === "approved" ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="mr-1 h-4 w-4" />
        )}
        Approve
      </Button>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => setRejecting(true)}
        disabled={loading !== null}
      >
        <XCircle className="mr-1 h-4 w-4" />
        Reject
      </Button>
    </div>
  );
}
