import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getEmployeesForAssignment } from "@/actions/customers";
import { CustomerForm } from "@/components/forms/customer-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Customer",
};

export default async function NewCustomerPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const { data: employees } = await getEmployeesForAssignment();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Customer"
        description="Register a new customer"
      />
      <CustomerForm employees={employees ?? []} />
    </div>
  );
}
