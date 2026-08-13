import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { CompanyForm } from "@/components/forms/company-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Company",
};

export default async function NewCompanyPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Company"
        description="Register a new client company or partner"
      />
      <CompanyForm />
    </div>
  );
}
