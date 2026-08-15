"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Send, Wrench } from "lucide-react";
import { toast } from "sonner";
import { updateQuotationStatus } from "@/actions/quotations";
import { convertQuotationToContract } from "@/actions/contracts";

interface QuotationActionsProps {
  quotationId: string;
  currentStatus: string;
  userRole: string;
}

export function QuotationActions({
  quotationId,
  currentStatus,
  userRole,
}: QuotationActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleStatusChange(newStatus: string) {
    setLoading(newStatus);
    const result = await updateQuotationStatus(quotationId, newStatus);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Quotation ${newStatus} successfully`);
      router.refresh();
    }
    setLoading(null);
  }

  async function handleConvert() {
    setLoading("convert");
    const { data, error } = await convertQuotationToContract(quotationId);

    if (error || !data) {
      toast.error(error ?? "Could not convert this quotation.");
      setLoading(null);
      return;
    }

    toast.success(`Contract ${data.contract_number} created`);
    router.push(`/contracts/${data.id}`);
    router.refresh();
  }

  const isAdmin = userRole === "owner";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {currentStatus === "draft" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleStatusChange("sent")}
          disabled={loading !== null}
        >
          {loading === "sent" ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1 h-4 w-4" />
          )}
          Mark as Sent
        </Button>
      )}

      {(currentStatus === "draft" || currentStatus === "sent") && isAdmin && (
        <Button
          size="sm"
          onClick={() => handleStatusChange("approved")}
          disabled={loading !== null}
        >
          {loading === "approved" ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-1 h-4 w-4" />
          )}
          Approve
        </Button>
      )}

      {(currentStatus === "draft" || currentStatus === "sent") && (
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
      )}

      {currentStatus === "approved" && isAdmin && (
        <Button size="sm" onClick={handleConvert} disabled={loading !== null}>
          {loading === "convert" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wrench className="mr-2 h-4 w-4" />
          )}
          Convert to Contract
        </Button>
      )}
    </div>
  );
}
