import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SiteForm } from "@/components/forms/site-form";
import { getContracts } from "@/actions/contracts";
import { getSiteStages } from "@/actions/sites";
import { getEmployees } from "@/actions/employees";
import { getCompaniesForDropdown } from "@/actions/quotations";
import { getCurrentUser } from "@/actions/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Site",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewSitePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const contractId =
    typeof params.contract === "string" ? params.contract : undefined;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!["owner", "manager"].includes(currentUser.role)) redirect("/sites");

  const [{ data: contracts }, { data: stages }, { data: people }, { data: companies }] =
    await Promise.all([
      getContracts(),
      getSiteStages(),
      getEmployees({ status: "active" }),
      getCompaniesForDropdown(),
    ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="New Site"
        description="Every site belongs to a client. Group it under a contract only if this client handed you several sites under one award."
        backHref="/sites"
      />
      <SiteForm
        companies={companies ?? []}
        contracts={(contracts ?? []).map((c) => ({
          id: c.id,
          contract_number: c.contract_number,
          title: c.title,
          company_id: c.company_id,
        }))}
        stages={stages ?? []}
        people={(people ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))}
        defaultContractId={contractId}
      />
    </div>
  );
}
