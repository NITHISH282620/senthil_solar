import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, Mail, Phone, Building2, Shield } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentVault } from "@/components/shared/document-vault";
import { getEmployee } from "@/actions/employees";
import { getDocuments } from "@/actions/documents";
import { getCurrentUser } from "@/actions/auth";
import { formatDate, formatCurrency, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getEmployee(id);
  return {
    title: data?.full_name ?? "Employee",
  };
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: employee }, { data: documents }, currentUser] = await Promise.all([
    getEmployee(id),
    getDocuments("employee", id),
    getCurrentUser(),
  ]);

  if (!employee) {
    notFound();
  }

  const isAdmin = currentUser?.role === "owner";
  const isSelf = currentUser?.id === employee.id;

  const initials = employee.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader title="Employee Details">
        {(isAdmin || isSelf) && (
          <Link
            href={`/employees/${employee.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        )}
      </PageHeader>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">{employee.full_name}</h2>
                <StatusBadge
                  status={employee.is_active ? "active" : "inactive"}
                />
              </div>
              <p className="text-muted-foreground font-mono">
                {employee.employee_code}
              </p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Mail size={14} />
                  {employee.email}
                </span>
                {employee.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={14} />
                    {formatPhone(employee.phone)}
                  </span>
                )}
                {employee.department && (
                  <span className="flex items-center gap-1.5">
                    <Building2 size={14} />
                    {employee.department}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Shield size={14} />
                  <span className="capitalize">{employee.role}</span>
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Work Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Work Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Designation" value={employee.designation} />
            <InfoRow label="Department" value={employee.department} />
            <InfoRow
              label="Date of Joining"
              value={formatDate(employee.date_of_joining)}
            />
            {isAdmin && (
              <InfoRow
                label="Monthly Salary"
                value={
                  employee.monthly_salary ? formatCurrency(employee.monthly_salary) : "—"
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Address" value={employee.address} />
            <Separator />
            <InfoRow
              label="Emergency Contact"
              value={employee.emergency_contact_name}
            />
            <InfoRow
              label="Emergency Phone"
              value={formatPhone(employee.emergency_contact_phone)}
            />
          </CardContent>
        </Card>
      </div>

      <DocumentVault 
        entityType="employee" 
        entityId={employee.id} 
        initialDocuments={documents ?? []} 
      />
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-sm text-muted-foreground w-40 shrink-0">
        {label}
      </span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}
