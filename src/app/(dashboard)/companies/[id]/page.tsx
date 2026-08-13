import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Pencil,
  Mail,
  Phone,
  MapPin,
  Building2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentVault } from "@/components/shared/document-vault";
import { getCompany } from "@/actions/companies";
import { getDocuments } from "@/actions/documents";
import { getCurrentUser } from "@/actions/auth";
import { formatPhone, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getCompany(id);
  return {
    title: data?.name ?? "Company",
  };
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: company }, { data: documents }, currentUser] = await Promise.all([
    getCompany(id),
    getDocuments("company", id),
    getCurrentUser(),
  ]);

  if (!company) {
    notFound();
  }

  const primaryContact = company.contacts.find((c) => c.is_primary) || company.contacts[0];

  const canEdit =
    currentUser?.role === "owner" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader title="Company Details">
        {canEdit && (
          <Link
            href={`/companies/${company.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        )}
      </PageHeader>

      {/* Company Header */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{company.name}</h2>
              <StatusBadge status={company.status} />
            </div>
            <div className="flex gap-4">
              <p className="text-muted-foreground font-mono">
                {company.company_code}
              </p>
              {company.legal_name && (
                <p className="text-sm text-muted-foreground">
                  Legal: {company.legal_name}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {primaryContact?.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={14} />
                  {formatPhone(primaryContact.phone)}
                </span>
              )}
              {primaryContact?.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={14} />
                  {primaryContact.email}
                </span>
              )}
              {company.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {company.city}
                  {company.state_code ? `, ${company.state_code}` : ""}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Building2 size={14} />
                <span className="capitalize">
                  {company.company_type}
                </span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact & Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Primary Contact & Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Name" value={primaryContact ? primaryContact.name : "—"} />
            <InfoRow label="Phone" value={primaryContact ? formatPhone(primaryContact.phone) : "—"} />
            <InfoRow label="Email" value={primaryContact?.email} />
            <Separator />
            <InfoRow label="Billing Address" value={company.billing_address} />
            <InfoRow label="Shipping Address" value={company.shipping_address} />
            <InfoRow label="City" value={company.city} />
            <InfoRow label="State" value={company.state} />
            <InfoRow label="Pincode" value={company.pincode} />
          </CardContent>
        </Card>

        {/* Commercial Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commercial Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="GST Number" value={company.gst_number} />
            <InfoRow label="PAN Number" value={company.pan_number} />
            <InfoRow label="State Code (GST)" value={company.state_code} />
            <Separator />
            <InfoRow label="Payment Terms" value={`${company.payment_terms_days} days`} />
            <InfoRow label="Credit Limit" value={company.credit_limit ? `₹${company.credit_limit.toLocaleString()}` : "—"} />
            <InfoRow label="TDS Applicable" value={company.tds_applicable ? `Yes (${company.tds_percent}%)` : "No"} />
            <InfoRow label="Retention" value={`${company.retention_percent}%`} />
            <Separator />
            <InfoRow
              label="Created"
              value={formatDate(company.created_at)}
            />
          </CardContent>
        </Card>
      </div>
      
      {company.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
          </CardContent>
        </Card>
      )}

      <DocumentVault 
        entityType="company" 
        entityId={company.id} 
        initialDocuments={documents ?? []} 
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related Records</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contracts, quotations, and invoices for this company will appear
            here.
          </p>
        </CardContent>
      </Card>
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
