import { notFound } from "next/navigation";
import Link from "next/link";
import { Printer, MapPin, Building, FileText, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { PaymentModalWrapper } from "@/components/shared/payment-modal-wrapper";
import { DocumentVault } from "@/components/shared/document-vault";
import { getInvoice } from "@/actions/invoices";
import { getDocuments } from "@/actions/documents";
import { getCompanySettings } from "@/actions/settings";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getInvoice(id);
  return {
    title: data ? `${data.invoice_number} | Invoice` : "Invoice",
  };
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [invoiceRes, settingsRes, documentsRes, currentUser] = await Promise.all([
    getInvoice(id),
    getCompanySettings(),
    getDocuments("invoice", id),
    getCurrentUser(),
  ]);
  
  const invoice = invoiceRes.data;
  const settings = settingsRes.data;
  const documents = documentsRes.data;

  if (!invoice) {
    notFound();
  }

  const canEdit = currentUser?.role === "owner" || currentUser?.role === "manager";
  const isPaid = invoice.status === "paid";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {invoice.invoice_number}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-muted-foreground">
            Created on {formatDate(invoice.created_at)}
          </p>
        </div>
        
        <div className="flex gap-2">
          {canEdit && !isPaid && (
            <PaymentModalWrapper invoiceId={invoice.id} balanceDue={invoice.balance_due ?? 0} />
          )}
          
          <Link
            href={`/billing/${invoice.id}/print`}
            target="_blank"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print / PDF
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Invoice Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground bg-muted/30">
                    <tr>
                      <th className="px-2 py-3 text-left font-medium">Description</th>
                      <th className="px-2 py-3 text-right font-medium">Qty</th>
                      <th className="px-2 py-3 text-right font-medium">Price</th>
                      <th className="px-2 py-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoice.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-2 py-3">
                          <div className="font-medium">{item.description}</div>
                        </td>
                        <td className="px-2 py-3 text-right">
                          {item.quantity} <span className="text-xs text-muted-foreground">{item.unit}</span>
                        </td>
                        <td className="px-2 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                        <td className="px-2 py-3 text-right font-medium">
                          {formatCurrency(item.line_total ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <div className="w-64 space-y-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  {invoice.discount_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount</span>
                      <span>-{formatCurrency(invoice.discount_amount ?? 0)}</span>
                    </div>
                  )}
                  {invoice.cgst_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST</span>
                      <span>{formatCurrency(invoice.cgst_amount)}</span>
                    </div>
                  )}
                  {invoice.sgst_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST</span>
                      <span>{formatCurrency(invoice.sgst_amount)}</span>
                    </div>
                  )}
                  {invoice.igst_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>IGST</span>
                      <span>{formatCurrency(invoice.igst_amount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>{formatCurrency(invoice.total_amount ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Amount Received</span>
                    <span>{formatCurrency(invoice.amount_received ?? 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg text-primary">
                    <span>Balance Due</span>
                    <span>{formatCurrency(invoice.balance_due ?? 0)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </CardContent>
            </Card>
          )}

          {invoice.payments && invoice.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  Payment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between items-center border-b last:border-0 pb-4 last:pb-0">
                      <div>
                        <div className="font-medium text-emerald-600">
                          {formatCurrency(payment.amount)}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          <span className="capitalize">{payment.payment_method.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{formatDate(payment.payment_date)}</span>
                        </div>
                        {payment.reference_number && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Ref: {payment.reference_number}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-right text-muted-foreground">
                        Received by<br/>
                        {payment.received_by_profile?.full_name || "Unknown"}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Billed To
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="font-medium text-lg">{invoice.company?.name}</div>
                {invoice.company?.billing_address && (
                  <div className="text-sm text-muted-foreground flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {invoice.company.billing_address}
                      {invoice.company.city && <>, {invoice.company.city}</>}
                    </span>
                  </div>
                )}
                {/* Email and Phone would come from a contact person in a real implementation */}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                From
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="font-medium text-lg flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  {settings?.company_name || "Company Name"}
                </div>
                {settings?.address && (
                  <div className="text-sm text-muted-foreground">
                    {settings.address}
                  </div>
                )}
                {settings?.gst_number && (
                  <div className="text-sm text-muted-foreground">
                    GSTIN: {settings.gst_number}
                  </div>
                )}

              </div>
            </CardContent>
          </Card>

          {invoice.contract && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Linked Records
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Contract</span>
                  <Link href={`/contracts/${invoice.contract.id}`} className="font-medium text-primary hover:underline">
                    {invoice.contract.contract_number}
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <DocumentVault 
            entityType="invoice" 
            entityId={invoice.id} 
            initialDocuments={documents ?? []} 
          />
        </div>
      </div>
    </div>
  );
}
