import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SiteForm } from "@/components/forms/site-form";
import { getContracts } from "@/actions/contracts";
import { getSite, getSiteStages } from "@/actions/sites";
import { getEmployees } from "@/actions/employees";
import { getCompaniesForDropdown } from "@/actions/quotations";
import { getCurrentUser } from "@/actions/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Site",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSitePage({ params }: PageProps) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!["owner", "manager"].includes(currentUser.role)) redirect(`/sites/${id}`);

  const [{ data: site }, { data: contracts }, { data: stages }, { data: people }, { data: companies }] =
    await Promise.all([
      getSite(id),
      getContracts(),
      getSiteStages(),
      getEmployees({ status: "active" }),
      getCompaniesForDropdown(),
    ]);

  if (!site) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`Edit ${site.name}`} backHref={`/sites/${id}`} />
      <SiteForm
        initialData={site}
        companies={companies ?? []}
        contracts={(contracts ?? []).map((c) => ({
          id: c.id,
          contract_number: c.contract_number,
          title: c.title,
          company_id: c.company_id,
        }))}
        stages={stages ?? []}
        people={(people ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))}
      />
    </div>
  );
}
