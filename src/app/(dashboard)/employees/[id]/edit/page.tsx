import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getEmployee, getManagers } from "@/actions/employees";
import { EmployeeForm } from "@/components/forms/employee-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Employee",
};

export default async function EditEmployeePage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: employee }, currentUser, { data: managers }] =
    await Promise.all([getEmployee(id), getCurrentUser(), getManagers()]);

  if (!employee) {
    notFound();
  }

  if (!currentUser) {
    redirect("/login");
  }

  // Only admin can edit others, users can edit themselves
  const isAdmin = currentUser.role === "owner";
  if (!isAdmin && currentUser.id !== employee.id) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Employee"
        description={`Updating ${employee.full_name}'s profile`}
      />
      <EmployeeForm
        employee={employee}
        managers={managers ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
