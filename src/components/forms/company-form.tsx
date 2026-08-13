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
import { createCompany, updateCompany } from "@/actions/companies";
import type { Company, CompanyContact } from "@/types/database";
import { Checkbox } from "@/components/ui/checkbox";

interface CompanyFormProps {
  company?: (Company & { contacts?: CompanyContact[] }) | null;
}

export function CompanyForm({ company }: CompanyFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEdit = !!company;
  
  const primaryContact = company?.contacts?.find(c => c.is_primary) || company?.contacts?.[0];

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    let result;
    if (isEdit) {
      result = await updateCompany(company.id, formData);
    } else {
      result = await createCompany(formData);
    }

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success(
      isEdit ? "Company updated successfully" : "Company created successfully"
    );
    router.push("/companies");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={company?.name ?? ""}
              required
              placeholder="Full registered name"
              disabled={loading}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="legal_name">Legal Name</Label>
            <Input
              id="legal_name"
              name="legal_name"
              defaultValue={company?.legal_name ?? ""}
              placeholder="e.g. Sentil Solar Pvt Ltd"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_type">Company Type</Label>
            <Select name="company_type" defaultValue={company?.company_type ?? "corporate"} disabled={loading}>
              <SelectTrigger id="company_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="factory">Factory</SelectItem>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="residential">Residential</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={company?.status ?? "active"} disabled={loading}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Primary Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Primary Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="primary_contact_name">Full Name *</Label>
            <Input
              id="primary_contact_name"
              name="primary_contact_name"
              defaultValue={primaryContact?.name ?? ""}
              required
              placeholder="Full name"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="primary_contact_email">Email</Label>
            <Input
              id="primary_contact_email"
              name="primary_contact_email"
              type="email"
              defaultValue={primaryContact?.email ?? ""}
              placeholder="contact@company.com"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="primary_contact_phone">Phone</Label>
            <Input
              id="primary_contact_phone"
              name="primary_contact_phone"
              type="tel"
              defaultValue={primaryContact?.phone ?? ""}
              placeholder="10-digit number"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Commercial Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commercial Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gst_number">GST Number</Label>
            <Input
              id="gst_number"
              name="gst_number"
              defaultValue={company?.gst_number ?? ""}
              placeholder="e.g., 29AABCU9603R1ZM"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pan_number">PAN Number</Label>
            <Input
              id="pan_number"
              name="pan_number"
              defaultValue={company?.pan_number ?? ""}
              placeholder="e.g., AABCU9603R"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment_terms_days">Payment Terms (Days)</Label>
            <Input
              id="payment_terms_days"
              name="payment_terms_days"
              type="number"
              defaultValue={company?.payment_terms_days ?? 30}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit_limit">Credit Limit (₹)</Label>
            <Input
              id="credit_limit"
              name="credit_limit"
              type="number"
              defaultValue={company?.credit_limit ?? ""}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tds_percent">TDS Percent (%)</Label>
            <Input
              id="tds_percent"
              name="tds_percent"
              type="number"
              step="0.1"
              defaultValue={company?.tds_percent ?? 2}
              disabled={loading}
            />
          </div>
          <div className="space-y-2 flex items-center gap-2 pt-8">
            <Checkbox 
              id="tds_applicable" 
              name="tds_applicable" 
              defaultChecked={company?.tds_applicable ?? false} 
              disabled={loading} 
            />
            <Label htmlFor="tds_applicable" className="cursor-pointer">TDS Applicable</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="retention_percent">Retention Percent (%)</Label>
            <Input
              id="retention_percent"
              name="retention_percent"
              type="number"
              step="0.1"
              defaultValue={company?.retention_percent ?? 0}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="billing_address">Billing Address</Label>
            <Textarea
              id="billing_address"
              name="billing_address"
              defaultValue={company?.billing_address ?? ""}
              placeholder="Street address for billing"
              rows={2}
              disabled={loading}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="shipping_address">Shipping/Site Address (Optional)</Label>
            <Textarea
              id="shipping_address"
              name="shipping_address"
              defaultValue={company?.shipping_address ?? ""}
              placeholder="Default site address if different"
              rows={2}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              defaultValue={company?.city ?? ""}
              placeholder="City"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              name="state"
              defaultValue={company?.state ?? ""}
              placeholder="State"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state_code">State Code (GST)</Label>
            <Input
              id="state_code"
              name="state_code"
              defaultValue={company?.state_code ?? ""}
              placeholder="e.g. 29 for Karnataka"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              name="pincode"
              defaultValue={company?.pincode ?? ""}
              placeholder="6-digit pincode"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={company?.notes ?? ""}
              placeholder="Any additional information..."
              rows={4}
              disabled={loading}
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
          {isEdit ? "Update Company" : "Create Company"}
        </Button>
      </div>
    </form>
  );
}
