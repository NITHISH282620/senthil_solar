import { ContractForm } from "@/components/forms/contract-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/actions/auth";
import { getCompanies } from "@/actions/companies";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Contract",
};

export default async function NewContractPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    redirect("/contracts");
  }

  const { data: companies } = await getCompanies();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="New Contract"
        description="Create a new client contract or agreement."
        backHref="/contracts"
      />
      <ContractForm companies={companies ?? []} />
    </div>
  );
}
