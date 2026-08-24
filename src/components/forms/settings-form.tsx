"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateCompanySettings } from "@/actions/settings";
import type { CompanySettings } from "@/types/database";

interface SettingsFormProps {
  settings: CompanySettings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await updateCompanySettings(formData);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Settings updated successfully");
    }
    setLoading(false);
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Information</CardTitle>
          <CardDescription>
            Basic company details used in invoices, quotations, and reports
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input
              id="company_name"
              name="company_name"
              defaultValue={settings.company_name}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={settings.email ?? ""}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={settings.phone ?? ""}
              disabled={loading}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={settings.address ?? ""}
              rows={3}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tax & Compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax & Compliance</CardTitle>
          <CardDescription>
            Tax registration numbers and default tax rate
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gst_number">GST Number</Label>
            <Input
              id="gst_number"
              name="gst_number"
              defaultValue={settings.gst_number ?? ""}
              placeholder="e.g., 29AABCU9603R1ZM"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pan_number">PAN Number</Label>
            <Input
              id="pan_number"
              name="pan_number"
              defaultValue={settings.pan_number ?? ""}
              placeholder="e.g., AABCU9603R"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              name="state"
              defaultValue={settings.state ?? ""}
              placeholder="e.g. Tamil Nadu"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state_code">State Code (GST)</Label>
            <Input
              id="state_code"
              name="state_code"
              defaultValue={settings.state_code ?? ""}
              placeholder="e.g. 33 for Tamil Nadu"
              maxLength={2}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Decides CGST+SGST vs IGST on invoices.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_gst_percent">Default GST Rate (%)</Label>
            <Input
              id="default_gst_percent"
              name="default_gst_percent"
              type="number"
              step="0.01"
              defaultValue={settings.default_gst_percent}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Prefixes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Number Prefixes</CardTitle>
          <CardDescription>
            Prefixes for auto-generated document numbers (e.g., INV-2026-001)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
            <Input
              id="invoice_prefix"
              name="invoice_prefix"
              defaultValue={settings.invoice_prefix}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quotation_prefix">Quotation Prefix</Label>
            <Input
              id="quotation_prefix"
              name="quotation_prefix"
              defaultValue={settings.quotation_prefix}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contract_prefix">Contract Prefix</Label>
            <Input
              id="contract_prefix"
              name="contract_prefix"
              defaultValue={settings.contract_prefix}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site_prefix">Site Prefix</Label>
            <Input
              id="site_prefix"
              name="site_prefix"
              defaultValue={settings.site_prefix}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Separator />
      <Button type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Settings"
        )}
      </Button>
    </form>
  );
}
