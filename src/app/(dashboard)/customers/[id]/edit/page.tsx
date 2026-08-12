import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCustomer, getEmployeesForAssignment } from "@/actions/customers";
import { CustomerForm } from "@/components/forms/customer-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Customer",
};

export default async function EditCustomerPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: customer }, currentUser, { data: employees }] =
    await Promise.all([
      getCustomer(id),
      getCurrentUser(),
      getEmployeesForAssignment(),
    ]);

  if (!customer) {
    notFound();
  }

  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Customer"
        description={`Updating ${customer.name}'s profile`}
      />
      <CustomerForm customer={customer} employees={employees ?? []} />
    </div>
  );
}
