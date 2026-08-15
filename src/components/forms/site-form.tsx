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
import { createSite, updateSite } from "@/actions/sites";
import type { Site } from "@/types/database";

interface SiteFormProps {
  initialData?: Site | null;
  contracts: { id: string; contract_number: string; title: string }[];
  stages: { code: string; label: string }[];
  people: { id: string; full_name: string }[];
  /** Preselects the parent when arriving from a contract page. */
  defaultContractId?: string;
}

export function SiteForm({
  initialData,
  contracts,
  stages,
  people,
  defaultContractId,
}: SiteFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [contractId, setContractId] = useState(
    initialData?.contract_id ?? defaultContractId ?? ""
  );
  const [stage, setStage] = useState(initialData?.stage ?? "planning");
  const [status, setStatus] = useState(initialData?.status ?? "active");
  const [engineerId, setEngineerId] = useState(
    initialData?.site_engineer_id ?? ""
  );
  const [supervisorId, setSupervisorId] = useState(
    initialData?.supervisor_id ?? ""
  );

  async function handleSubmit(formData: FormData) {
    if (!contractId) {
      toast.error("Choose the parent contract.");
      return;
    }

    setLoading(true);

    // Base UI selects are not native controls, so post their values by hand.
    formData.set("contract_id", contractId);
    formData.set("stage", stage);
    formData.set("status", status);
    formData.set("site_engineer_id", engineerId);
    formData.set("supervisor_id", supervisorId);

    if (initialData) {
      const { error } = await updateSite(initialData.id, formData);
      if (error) {
        toast.error(error);
        setLoading(false);
        return;
      }
      toast.success("Site updated");
      router.push(`/sites/${initialData.id}`);
    } else {
      const { data, error } = await createSite(formData);
      if (error || !data) {
        toast.error(error ?? "Could not create the site.");
        setLoading(false);
        return;
      }
      toast.success(`Site ${data.site_code} created`);
      router.push(`/sites/${data.id}`);
    }

    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Parent contract *</Label>
            <Select
              value={contractId}
              onValueChange={(v) => setContractId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Which contract is this site under?" />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.contract_number} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The client company is inherited from the contract.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Site name *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={initialData?.name}
              placeholder="e.g. Plant 2 Rooftop"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity_kw">Capacity (kW)</Label>
            <Input
              id="capacity_kw"
              name="capacity_kw"
              type="number"
              step="0.001"
              min="0"
              defaultValue={initialData?.capacity_kw ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v ?? "planning")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "active")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allocated_value">Allocated value (₹)</Label>
            <Input
              id="allocated_value"
              name="allocated_value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initialData?.allocated_value ?? 0}
            />
            <p className="text-xs text-muted-foreground">
              This site&apos;s share of the contract. Drives its profit figure.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="progress_percent">Progress (%)</Label>
            <Input
              id="progress_percent"
              name="progress_percent"
              type="number"
              min="0"
              max="100"
              defaultValue={initialData?.progress_percent ?? 0}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={initialData?.address ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="district">District</Label>
            <Input
              id="district"
              name="district"
              defaultValue={initialData?.district ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              name="state"
              defaultValue={initialData?.state ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gps_lat">GPS latitude</Label>
            <Input
              id="gps_lat"
              name="gps_lat"
              type="number"
              step="0.0000001"
              defaultValue={initialData?.gps_lat ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gps_lng">GPS longitude</Label>
            <Input
              id="gps_lng"
              name="gps_lng"
              type="number"
              step="0.0000001"
              defaultValue={initialData?.gps_lng ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Used to geofence attendance check-ins.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team and schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Site engineer</Label>
            <Select
              value={engineerId}
              onValueChange={(v) => setEngineerId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Supervisor</Label>
            <Select
              value={supervisorId}
              onValueChange={(v) => setSupervisorId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planned_start_date">Planned start</Label>
            <Input
              id="planned_start_date"
              name="planned_start_date"
              type="date"
              defaultValue={initialData?.planned_start_date ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="planned_end_date">Planned end</Label>
            <Input
              id="planned_end_date"
              name="planned_end_date"
              type="date"
              defaultValue={initialData?.planned_end_date ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workers_required">Workers required</Label>
            <Input
              id="workers_required"
              name="workers_required"
              type="number"
              min="0"
              defaultValue={initialData?.workers_required ?? ""}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={initialData?.notes ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
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
          {initialData ? "Save changes" : "Create site"}
        </Button>
      </div>
    </form>
  );
}
