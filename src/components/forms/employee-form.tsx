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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createEmployee, updateEmployee } from "@/actions/employees";
import { ROLE_OPTIONS } from "@/lib/constants";
import type { Profile } from "@/types/database";

interface EmployeeFormProps {
  employee?: Profile | null;
  managers?: { id: string; full_name: string; employee_id: string }[];
  isAdmin: boolean;
}

export function EmployeeForm({
  employee,
  managers = [],
  isAdmin,
}: EmployeeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEdit = !!employee;

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    let result;
    if (isEdit) {
      result = await updateEmployee(employee.id, formData);
    } else {
      result = await createEmployee(formData);
    }

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success(
      isEdit
        ? "Employee updated successfully"
        : "Employee created successfully"
    );
    router.push("/employees");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={employee?.full_name ?? ""}
              required
              placeholder="Enter full name"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={employee?.email ?? ""}
              required
              placeholder="employee@company.com"
              disabled={loading || isEdit}
            />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Minimum 6 characters"
                minLength={6}
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={employee?.phone ?? ""}
              placeholder="10-digit phone number"
              disabled={loading}
            />
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                name="role"
                defaultValue={employee?.role ?? "employee"}
                disabled={loading}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={employee?.address ?? ""}
              placeholder="Full address"
              rows={3}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Status (Edit only, Admin only) */}
      {isEdit && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Switch
                id="is_active"
                name="is_active"
                defaultChecked={employee?.is_active ?? true}
                value="true"
                disabled={loading}
              />
              <Label htmlFor="is_active">Active Employee</Label>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Inactive employees cannot log in to the system.
            </p>
          </CardContent>
        </Card>
      )}

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
            "Update Employee"
          ) : (
            "Create Employee"
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
