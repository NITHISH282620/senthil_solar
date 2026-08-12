"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  async function handleStatusChange(newStatus: string) {
    setLoading(newStatus);
    const result = await updateExpenseStatus(expenseId, newStatus);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Expense ${newStatus} successfully`);
      router.refresh();
    }
    setLoading(null);
  }

  if (currentStatus !== "pending") return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => handleStatusChange("approved")}
        disabled={loading !== null}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
        onClick={() => handleStatusChange("rejected")}
        disabled={loading !== null}
      >
        {loading === "rejected" ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="mr-1 h-4 w-4" />
        )}
        Reject
      </Button>
    </div>
  );
}
