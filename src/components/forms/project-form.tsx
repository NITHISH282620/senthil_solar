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
import { createProject, updateProject } from "@/actions/projects";
import type { Project, ProjectStatus, ProjectRateType } from "@/types/database";
import { PROJECT_STATUSES, PROJECT_RATE_TYPES } from "@/lib/constants";

interface ProjectFormProps {
  initialData?: Project | null;
}

export function ProjectForm({ initialData }: ProjectFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(initialData?.status || "not_started");
  const [rateType, setRateType] = useState(initialData?.rate_type || "lump_sum");

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    try {
      formData.set("status", status);
      formData.set("rate_type", rateType);

      if (initialData) {
        const result = await updateProject(initialData.id, formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Project updated");
        router.push(`/projects/${initialData.id}`);
      } else {
        const result = await createProject(formData);
        if (result.error || !result.data) {
          toast.error(result.error ?? "Could not create project.");
          return;
        }
        toast.success("Project created");
        router.push(`/projects/${result.data.id}`);
      }
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Basic Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={initialData?.name}
                required
                placeholder="e.g. Coimbatore Solar Park Phase 2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope_description">Scope Description</Label>
            <Textarea
              id="scope_description"
              name="scope_description"
              defaultValue={initialData?.scope_description || ""}
              placeholder="Detailed description of the work to be done..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="client_company">Client Company *</Label>
              <Input
                id="client_company"
                name="client_company"
                defaultValue={initialData?.client_company}
                required
                placeholder="e.g. Tata Power Solar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_contact_name">Contact Name</Label>
              <Input
                id="client_contact_name"
                name="client_contact_name"
                defaultValue={initialData?.client_contact_name || ""}
                placeholder="e.g. Mr. Sharma"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_contact_phone">Contact Phone</Label>
              <Input
                id="client_contact_phone"
                name="client_contact_phone"
                defaultValue={initialData?.client_contact_phone || ""}
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="client_gst">Client GST Number (for billing)</Label>
              <Input
                id="client_gst"
                name="client_gst"
                defaultValue={initialData?.client_gst || ""}
                placeholder="e.g. 33AABCC1234F1Z5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location & Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="district">District *</Label>
              <Input
                id="district"
                name="district"
                defaultValue={initialData?.district || ""}
                required
                placeholder="e.g. Coimbatore"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_workers_required">Expected Workforce Size</Label>
              <Input
                id="total_workers_required"
                name="total_workers_required"
                type="number"
                min="1"
                defaultValue={initialData?.total_workers_required || ""}
                placeholder="e.g. 25"
              />
            </div>

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

            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                defaultValue={initialData?.start_date || ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_end_date">Expected End Date</Label>
              <Input
                id="expected_end_date"
                name="expected_end_date"
                type="date"
                defaultValue={initialData?.expected_end_date || ""}
              />
            </div>

            {initialData && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="actual_end_date">Actual End Date</Label>
                  <Input
                    id="actual_end_date"
                    name="actual_end_date"
                    type="date"
                    defaultValue={initialData?.actual_end_date || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="progress_percent">Progress %</Label>
                  <Input
                    id="progress_percent"
                    name="progress_percent"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={initialData?.progress_percent || 0}
                  />
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="site_gps_lat">GPS Latitude</Label>
              <Input
                id="site_gps_lat"
                name="site_gps_lat"
                type="number"
                step="any"
                defaultValue={initialData?.site_gps_lat || ""}
                placeholder="e.g. 11.0168"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_gps_lng">GPS Longitude</Label>
              <Input
                id="site_gps_lng"
                name="site_gps_lng"
                type="number"
                step="any"
                defaultValue={initialData?.site_gps_lng || ""}
                placeholder="e.g. 76.9558"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commercials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="rate_type">Rate Type</Label>
              <Select value={rateType} onValueChange={(v) => setRateType(v as ProjectRateType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_RATE_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_amount">Rate Amount (₹)</Label>
              <Input
                id="rate_amount"
                name="rate_amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={initialData?.rate_amount || ""}
                placeholder="e.g. 50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_unit">Rate Unit</Label>
              <Input
                id="rate_unit"
                name="rate_unit"
                defaultValue={initialData?.rate_unit || ""}
                placeholder="e.g. per kW, per day, lump sum"
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
              rows={3}
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
          {initialData ? "Update Project" : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
