import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getManagers } from "@/actions/employees";
import { EmployeeForm } from "@/components/forms/employee-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Employee",
};

export default async function NewEmployeePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: managers } = await getManagers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Employee"
        description="Create a new employee account"
      />
      <EmployeeForm isAdmin={true} managers={managers ?? []} />
    </div>
  );
}
