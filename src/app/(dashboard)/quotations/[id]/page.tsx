import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { QuotationActions } from "@/components/shared/quotation-actions";
import { DocumentVault } from "@/components/shared/document-vault";
import { getQuotation } from "@/actions/quotations";
import { getDocuments } from "@/actions/documents";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getQuotation(id);
  return {
    title: data?.quotation_number ?? "Quotation",
  };
}

export default async function QuotationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: quotation }, { data: documents }, currentUser] = await Promise.all([
    getQuotation(id),
    getDocuments("quotation", id),
    getCurrentUser(),
  ]);

  if (!quotation) {
    notFound();
  }

  const canEdit =
    currentUser?.role === "owner" || currentUser?.role === "manager";

  // Editing the priced work is only safe before the client has accepted it;
  // updateQuotation refuses an approved or converted quotation for the same
  // reason.
  const isEditable = quotation.status === "draft" || quotation.status === "sent";

  // The actions block must stay visible for one status longer than editing
  // does. "Convert to Contract" renders only when the quotation is approved,
  // and the block that contains it was hidden the moment it became approved —
  // two conditions that could never both be true, so an accepted quotation
  // could never become a contract at all. That is the join between winning
  // work and doing it.
  const hasActions =
    isEditable || quotation.status === "approved";

  return (
    <div className="space-y-6">
      <PageHeader title="Quotation Details">
        <div className="flex items-center gap-2">
          {canEdit && isEditable && (
            <Link
              href={`/quotations/${quotation.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Link>
          )}
        </div>
      </PageHeader>

      {/* Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{quotation.title}</h2>
                <StatusBadge status={quotation.status} />
              </div>
              <p className="text-muted-foreground font-mono">
                {quotation.quotation_number}
              </p>
              {quotation.company && (
                <p className="text-sm">
                  Company:{" "}
                  <Link
                    href={`/companies/${quotation.company.id}`}
                    className="text-primary hover:underline"
                  >
                    {quotation.company.name}
                  </Link>
                </p>
              )}
              {quotation.description && (
                <p className="text-sm text-muted-foreground mt-2">
                  {quotation.description}
                </p>
              )}
            </div>

            <div className="text-right space-y-1">
              <h2 className="text-3xl font-bold tracking-tight mb-2 text-primary">
                ₹{(quotation.total_amount ?? 0).toLocaleString()}
              </h2>
              {quotation.valid_until && (
                <p className="text-sm text-muted-foreground">
                  Valid until: {formatDate(quotation.valid_until)}
                </p>
              )}
            </div>
          </div>

          <DocumentVault 
            entityType="quotation" 
            entityId={quotation.id} 
            initialDocuments={documents ?? []} 
          />

          {/* Status Actions */}
          {canEdit && hasActions && currentUser && (
            <div className="mt-4 pt-4 border-t">
              <QuotationActions
                quotationId={quotation.id}
                currentStatus={quotation.status}
                userRole={currentUser.role}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Details */}
      {(((quotation.capacity_kw ?? 0) > 0) || quotation.panel_type || quotation.inverter_type) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Specifications</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(quotation.capacity_kw ?? 0) > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">Capacity</p>
                <span className="font-medium">{quotation.capacity_kw} kW</span>
              </div>
            )}
            {quotation.panel_type && (
              <div>
                <p className="text-sm text-muted-foreground">Panel Type</p>
                <p className="font-medium">{quotation.panel_type}</p>
              </div>
            )}
            {quotation.inverter_type && (
              <div>
                <p className="text-sm text-muted-foreground">Inverter</p>
                <p className="font-medium">{quotation.inverter_type}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotation.quotation_items?.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.description}
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.line_total ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(quotation.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm border-t">
                <span className="text-muted-foreground">Tax ({quotation.gst_percent}%)</span>
                <span className="font-medium">{formatCurrency(quotation.gst_amount)}</span>
              </div>
              {quotation.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{formatCurrency(quotation.discount_amount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="font-bold text-base">{formatCurrency(quotation.total_amount ?? 0)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {quotation.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{quotation.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
