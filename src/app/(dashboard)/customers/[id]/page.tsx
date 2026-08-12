import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Pencil,
  Mail,
  Phone,
  MapPin,
  Building2,
  Tag,
  User,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentVault } from "@/components/shared/document-vault";
import { getCustomer } from "@/actions/customers";
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
  const { data } = await getCustomer(id);
  return {
    title: data?.name ?? "Customer",
  };
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: customer }, { data: documents }, currentUser] = await Promise.all([
    getCustomer(id),
    getDocuments("customer", id),
    getCurrentUser(),
  ]);

  if (!customer) {
    notFound();
  }

  const canEdit =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader title="Customer Details">
        {canEdit && (
          <Link
            href={`/customers/${customer.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        )}
      </PageHeader>

      {/* Customer Header */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{customer.name}</h2>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-muted-foreground font-mono">
              {customer.customer_id}
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Phone size={14} />
                {formatPhone(customer.phone)}
              </span>
              {customer.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={14} />
                  {customer.email}
                </span>
              )}
              {customer.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {customer.city}
                  {customer.state ? `, ${customer.state}` : ""}
                </span>
              )}
              {customer.source && (
                <span className="flex items-center gap-1.5">
                  <Tag size={14} />
                  <span className="capitalize">
                    {customer.source.replace("_", " ")}
                  </span>
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact & Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact & Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Phone" value={formatPhone(customer.phone)} />
            {customer.alternate_phone && (
              <InfoRow
                label="Alt. Phone"
                value={formatPhone(customer.alternate_phone)}
              />
            )}
            <InfoRow label="Email" value={customer.email} />
            <Separator />
            <InfoRow label="Address" value={customer.address} />
            <InfoRow label="City" value={customer.city} />
            <InfoRow label="State" value={customer.state} />
            <InfoRow label="Pincode" value={customer.pincode} />
          </CardContent>
        </Card>

        {/* Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="GST Number" value={customer.gst_number} />
            <InfoRow
              label="Source"
              value={customer.source?.replace("_", " ")}
            />
            <InfoRow
              label="Created"
              value={formatDate(customer.created_at)}
            />
            <Separator />
            <InfoRow label="Notes" value={customer.notes} />
          </CardContent>
        </Card>
      </div>

      <DocumentVault 
        entityType="customer" 
        entityId={customer.id} 
        initialDocuments={documents ?? []} 
      />

      {/* Related Records — placeholder for Phase 2/3 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related Records</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Quotations, work orders, and invoices for this customer will appear
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
      <span className="text-sm font-medium capitalize">{value || "—"}</span>
    </div>
  );
}
