import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getClientStatement } from "@/actions/client-statement";
import { PageHeader } from "@/components/shared/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CheckCircle2, AlertCircle, IndianRupee, FileText, TrendingUp } from "lucide-react";
import type { Metadata } from "next";

const ALLOWED_ROLES = ["owner", "manager", "accountant"];

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { companyId } = await params;
  const { data } = await getClientStatement(companyId);
  return { title: data ? `${data.company_name} — Statement` : "Client Statement" };
}

export default async function ClientStatementDetailPage({ params }: PageProps) {
  const { companyId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!ALLOWED_ROLES.includes(currentUser.role)) redirect("/dashboard");

  const { data: statement, error } = await getClientStatement(companyId);

  if (error === "Company not found." || !statement) notFound();
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client Statement" backHref="/client-statement" />
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  const paidPercent =
    statement.approved_amount > 0
      ? Math.min(100, Math.round((statement.total_paid / statement.approved_amount) * 100))
      : 0;

  const hasContract = statement.approved_amount > 0;
  const isFullyPaid = hasContract && statement.balance_due <= 0;

  const paymentMethodLabel = (method: string) => {
    const map: Record<string, string> = {
      bank_transfer: "Bank Transfer",
      cash: "Cash",
      cheque: "Cheque",
      upi: "UPI",
      online: "Online",
    };
    return map[method] ?? method;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={statement.company_name}
        description={`${statement.company_code} — Client Statement`}
        backHref="/client-statement"
      />

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Approved Amount */}
        <div className="rounded-xl border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Approved Contract Value
          </p>
          <p className="text-2xl font-bold">
            {statement.approved_amount > 0
              ? formatCurrency(statement.approved_amount)
              : "—"}
          </p>
          {statement.quotation && (
            <p className="text-xs text-muted-foreground">
              Quoted: {formatCurrency(statement.quotation.total_amount)}
            </p>
          )}
        </div>

        {/* Total Paid */}
        <div className="rounded-xl border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total Received
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(statement.total_paid)}
          </p>
          <p className="text-xs text-muted-foreground">
            {statement.payments.length} payment{statement.payments.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Balance Due */}
        <div
          className={`rounded-xl border p-5 space-y-1 ${
            !hasContract
              ? "bg-card"
              : isFullyPaid
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
          }`}
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Balance Due
          </p>
          <div className="flex items-center gap-2">
            {!hasContract ? (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            ) : isFullyPaid ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            <p
              className={`text-2xl font-bold ${
                !hasContract
                  ? "text-muted-foreground"
                  : isFullyPaid
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {!hasContract 
                ? "No Contract" 
                : isFullyPaid 
                ? "Fully Paid" 
                : formatCurrency(statement.balance_due)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      {statement.approved_amount > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">Payment Progress</p>
            <Badge variant={isFullyPaid ? "default" : "secondary"}>
              {paidPercent}% paid
            </Badge>
          </div>
          <Progress value={paidPercent} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>₹0</span>
            <span>{formatCurrency(statement.approved_amount)}</span>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="payments">
        <TabsList className="mb-4">
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4" />
            Payment Statement
          </TabsTrigger>
          <TabsTrigger value="quotation" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Quotation
          </TabsTrigger>
        </TabsList>

        {/* ─ Payment Statement Tab ─ */}
        <TabsContent value="payments" className="space-y-4">
          {statement.payments.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center space-y-2">
              <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Via</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Running Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.payments.map((payment, idx) => {
                    const runningTotal = statement.payments
                      .slice(0, idx + 1)
                      .reduce((s, p) => s + Number(p.amount), 0);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          {formatDate(payment.payment_date)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {paymentMethodLabel(payment.payment_method)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {payment.reference_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {payment.notes ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatCurrency(runningTotal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {/* Summary footer */}
              <div className="border-t bg-muted/30 px-4 py-3 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Contract Value: </span>
                    <span className="font-semibold">{formatCurrency(statement.approved_amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Received: </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(statement.total_paid)}
                    </span>
                  </div>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Balance Due: </span>
                  <span
                    className={`text-lg font-bold ${
                      !hasContract
                        ? "text-muted-foreground"
                        : isFullyPaid
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {!hasContract ? "—" : isFullyPaid ? "₹0 (Paid)" : formatCurrency(statement.balance_due)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─ Quotation Tab ─ */}
        <TabsContent value="quotation" className="space-y-4">
          {!statement.quotation ? (
            <div className="rounded-xl border bg-card p-10 text-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">
                No approved quotation found for this client.
              </p>
            </div>
          ) : (
            <>
              {/* Quotation header */}
              <div className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex flex-wrap gap-3 justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{statement.quotation.title}</h3>
                    <p className="text-sm text-muted-foreground font-mono">
                      {statement.quotation.quotation_number}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    {statement.quotation.capacity_kw && (
                      <Badge variant="outline">
                        {statement.quotation.capacity_kw} kW
                      </Badge>
                    )}
                    <Badge className="capitalize">{statement.quotation.status}</Badge>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              {statement.quotation.items.length === 0 ? (
                <p className="text-muted-foreground text-sm">No line items found.</p>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>#</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.quotation.items.map((item, idx) => {
                        const effectivePrice = item.unit_price;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{item.description}</p>
                              {item.section && (
                                <p className="text-xs text-muted-foreground">{item.section}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.unit ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(effectivePrice)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.total)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Totals footer */}
                  <div className="border-t bg-muted/30 p-4">
                    <div className="max-w-xs ml-auto space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatCurrency(statement.quotation.subtotal)}</span>
                      </div>
                      {statement.quotation.discount_amount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Discount</span>
                          <span className="text-red-500">
                            − {formatCurrency(statement.quotation.discount_amount)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          GST ({statement.quotation.gst_percent}%)
                        </span>
                        <span>{formatCurrency(statement.quotation.gst_amount)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Quoted Total</span>
                        <span>{formatCurrency(statement.quotation.total_amount)}</span>
                      </div>
                      {statement.quotation.approved_amount !== statement.quotation.total_amount && (
                        <div className="flex justify-between font-bold text-base text-emerald-600 dark:text-emerald-400">
                          <span>DSK Approved Amount</span>
                          <span>{formatCurrency(statement.quotation.approved_amount)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
