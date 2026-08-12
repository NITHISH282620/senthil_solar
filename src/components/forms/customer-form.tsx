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
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES } from "@/lib/constants";
import type { Customer } from "@/types/database";

interface CustomerFormProps {
  customer?: Customer | null;
  employees?: { id: string; full_name: string; employee_id: string }[];
}

export function CustomerForm({
  customer,
  employees = [],
}: CustomerFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEdit = !!customer;

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    let result;
    if (isEdit) {
      result = await updateCustomer(customer.id, formData);
    } else {
      result = await createCustomer(formData);
    }

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success(
      isEdit ? "Customer updated successfully" : "Customer created successfully"
    );
    router.push("/customers");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Customer Name *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={customer?.name ?? ""}
              required
              placeholder="Full name or company name"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={customer?.email ?? ""}
              placeholder="customer@email.com"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={customer?.phone ?? ""}
              required
              placeholder="10-digit phone number"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alternate_phone">Alternate Phone</Label>
            <Input
              id="alternate_phone"
              name="alternate_phone"
              type="tel"
              defaultValue={customer?.alternate_phone ?? ""}
              placeholder="Alternate number"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gst_number">GST Number</Label>
            <Input
              id="gst_number"
              name="gst_number"
              defaultValue={customer?.gst_number ?? ""}
              placeholder="e.g., 29AABCU9603R1ZM"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Full Address *</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={customer?.address ?? ""}
              required
              placeholder="Street address, area, landmark"
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              defaultValue={customer?.city ?? ""}
              placeholder="City"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              name="state"
              defaultValue={customer?.state ?? ""}
              placeholder="State"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              name="pincode"
              defaultValue={customer?.pincode ?? ""}
              placeholder="6-digit pincode"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="source">Lead Source</Label>
            <Select
              name="source"
              defaultValue={customer?.source ?? ""}
              disabled={loading}
            >
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_SOURCES.map((src) => (
                  <SelectItem key={src.value} value={src.value}>
                    {src.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              name="status"
              defaultValue={customer?.status ?? "active"}
              disabled={loading}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_to">Assigned To</Label>
            <Select
              name="assigned_to"
              defaultValue={customer?.assigned_to ?? ""}
              disabled={loading}
            >
              <SelectTrigger id="assigned_to">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={customer?.notes ?? ""}
              placeholder="Additional notes about this customer"
              rows={3}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Separator />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEdit ? "Updating..." : "Creating..."}
            </>
          ) : isEdit ? (
            "Update Customer"
          ) : (
            "Create Customer"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
