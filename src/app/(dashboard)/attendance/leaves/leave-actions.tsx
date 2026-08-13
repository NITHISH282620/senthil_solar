"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateLeaveStatus } from "@/actions/attendance";

export function LeaveRequestActions({ leaveId }: { leaveId: string }) {
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);

  const handleAction = async (status: "approved" | "rejected") => {
    setLoading(status);
    try {
      const formData = new FormData();
      formData.append("status", status);
      
      const result = await updateLeaveStatus(leaveId, formData);
      if (result.error) toast.error(result.error);
      else toast.success(`Leave request ${status}`);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button 
        variant="outline" 
        size="sm"
        className="text-emerald-600 hover:text-emerald-700"
        onClick={() => handleAction("approved")}
        disabled={loading !== null}
      >
        {loading === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      <Button 
        variant="outline" 
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => handleAction("rejected")}
        disabled={loading !== null}
      >
        {loading === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </Button>
    </div>
  );
}
