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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createWorkOrder, updateWorkOrder } from "@/actions/work-orders";
import type { WorkOrder } from "@/types/database";

interface WorkOrderFormProps {
  initialData?: WorkOrder | null;
  customers: { id: string; name: string; customer_id: string }[];
  quotations?: { id: string; quotation_number: string; title: string }[];
  prefilledQuotationId?: string;
  prefilledCustomerId?: string;
}

export function WorkOrderForm({
  initialData,
  customers,
  quotations = [],
  prefilledQuotationId,
  prefilledCustomerId,
}: WorkOrderFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState(
    initialData?.customer_id || prefilledCustomerId || ""
  );
  const [quotationId, setQuotationId] = useState(
    initialData?.quotation_id || prefilledQuotationId || ""
  );
  const [type, setType] = useState(initialData?.type || "installation");
  const [priority, setPriority] = useState(initialData?.priority || "medium");
  const [status, setStatus] = useState(initialData?.status || "pending");

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    try {
      formData.set("customer_id", customerId);
      if (quotationId) formData.set("quotation_id", quotationId);
      formData.set("type", type);
      formData.set("priority", priority);
      formData.set("status", status);

      const result = initialData
        ? await updateWorkOrder(initialData.id, formData)
        : await createWorkOrder(formData);

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(
          initialData ? "Work order updated" : "Work order created"
        );
        router.push(
          initialData
            ? `/work-orders/${initialData.id}`
            : `/work-orders/${(result as any).data.id}`
        );
        router.refresh();
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  // Filter quotations by selected customer
  const availableQuotations = quotations.filter(
    (q) => !customerId || (q as any).customer_id === customerId
  );

  return (
    <form action={handleSubmit} className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Basic Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={initialData?.title}
                required
                placeholder="e.g. 5kW Solar Installation at Residence"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select
                value={customerId}
                onValueChange={(v) => setCustomerId(v || "")}
                required
              >
                <SelectTrigger>
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
              {/* Hidden input for formData parsing if not using JS submission, but we modify formData in handleSubmit */}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quotation">Linked Quotation</Label>
              <Select
                value={quotationId}
                onValueChange={(v) => setQuotationId(v || "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select quotation (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableQuotations.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.quotation_number} - {q.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Work Type *</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={initialData?.description || ""}
              placeholder="Detailed description of the work to be done..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="scheduled_date">Scheduled Date</Label>
              <Input
                id="scheduled_date"
                name="scheduled_date"
                type="date"
                defaultValue={initialData?.scheduled_date?.split("T")[0] || ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimated_hours">Estimated Hours</Label>
              <Input
                id="estimated_hours"
                name="estimated_hours"
                type="number"
                step="0.5"
                min="0"
                defaultValue={initialData?.estimated_hours || ""}
                placeholder="e.g. 16.5"
              />
            </div>

            {initialData && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="started_at">Started At</Label>
                  <Input
                    id="started_at"
                    name="started_at"
                    type="datetime-local"
                    defaultValue={
                      initialData?.started_at
                        ? new Date(initialData.started_at).toISOString().slice(0, 16)
                        : ""
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="completed_at">Completed At</Label>
                  <Input
                    id="completed_at"
                    name="completed_at"
                    type="datetime-local"
                    defaultValue={
                      initialData?.completed_at
                        ? new Date(initialData.completed_at).toISOString().slice(0, 16)
                        : ""
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_hours">Actual Hours</Label>
                  <Input
                    id="actual_hours"
                    name="actual_hours"
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={initialData?.actual_hours || ""}
                  />
                </div>
              </>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="site_address">Site Address</Label>
              <Textarea
                id="site_address"
                name="site_address"
                defaultValue={initialData?.site_address || ""}
                placeholder="Installation or service address"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={initialData?.notes || ""}
              placeholder="Internal notes, access instructions, etc."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? "Update Work Order" : "Create Work Order"}
        </Button>
      </div>
    </form>
  );
}
