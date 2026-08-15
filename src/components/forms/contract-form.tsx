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
import { createContract, updateContract } from "@/actions/contracts";
import type { Contract, Company } from "@/types/database";

interface ContractFormProps {
  initialData?: Contract | null;
  companies: Pick<Company, "id" | "name">[];
}

export function ContractForm({ initialData, companies }: ContractFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [companyId, setCompanyId] = useState(initialData?.company_id || "");

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    // Select is not a native control, so its value has to be posted explicitly.
    formData.set("company_id", companyId);
    formData.set("status", status);

    if (initialData) {
      const { error } = await updateContract(initialData.id, formData);
      if (error) {
        toast.error(error);
        setLoading(false);
        return;
      }
      toast.success("Contract updated");
      router.push(`/contracts/${initialData.id}`);
    } else {
      const { data, error } = await createContract(formData);
      if (error || !data) {
        toast.error(error ?? "Could not create the contract.");
        setLoading(false);
        return;
      }
      toast.success(`Contract ${data.contract_number} created`);
      router.push(`/contracts/${data.id}`);
    }

    router.refresh();
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
              <Label htmlFor="title">Contract Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={initialData?.title}
                required
                placeholder="e.g. 500kW Rooftop Solar Installation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={status} onValueChange={(v) => setStatus(v || "draft")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company_id">Client Company *</Label>
              <Select value={companyId} onValueChange={(val) => setCompanyId(val || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Hidden input to ensure it gets submitted with FormData */}
              <input type="hidden" name="company_id" value={companyId} />
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
          <CardTitle>Commercials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="contract_value">Contract Value (₹) *</Label>
              <Input
                id="contract_value"
                name="contract_value"
                type="number"
                min="0"
                defaultValue={initialData?.contract_value}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_capacity_kw">Total Capacity (kW)</Label>
              <Input
                id="total_capacity_kw"
                name="total_capacity_kw"
                type="number"
                step="0.001"
                min="0"
                defaultValue={initialData?.total_capacity_kw || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_terms_days">Payment Terms (Days) *</Label>
              <Input
                id="payment_terms_days"
                name="payment_terms_days"
                type="number"
                min="0"
                defaultValue={initialData?.payment_terms_days ?? 30}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retention_percent">Retention Percent (%) *</Label>
              <Input
                id="retention_percent"
                name="retention_percent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={initialData?.retention_percent ?? 0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="penalty_per_day">Penalty per Day (₹) *</Label>
              <Input
                id="penalty_per_day"
                name="penalty_per_day"
                type="number"
                min="0"
                defaultValue={initialData?.penalty_per_day ?? 0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="penalty_cap_percent">Penalty Cap (%) *</Label>
              <Input
                id="penalty_cap_percent"
                name="penalty_cap_percent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={initialData?.penalty_cap_percent ?? 10}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <Label htmlFor="deadline_date">Deadline Date</Label>
              <Input
                id="deadline_date"
                name="deadline_date"
                type="date"
                defaultValue={initialData?.deadline_date || ""}
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
              </>
            )}
          </div>
        </CardContent>
      </Card>
      
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={initialData?.notes || ""}
          rows={3}
        />
      </div>

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
          {initialData ? "Update Contract" : "Create Contract"}
        </Button>
      </div>
    </form>
  );
}
