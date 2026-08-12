import { notFound } from "next/navigation";
import Link from "next/link";
import { Receipt, Calendar, User, Briefcase, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ExpenseActions } from "@/components/shared/expense-actions";
import { DocumentVault } from "@/components/shared/document-vault";
import { getExpense } from "@/actions/expenses";
import { getDocuments } from "@/actions/documents";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getExpense(id);
  return {
    title: data ? `${data.expense_number} | Expense` : "Expense",
  };
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: expense }, { data: documents }, currentUser] = await Promise.all([
    getExpense(id),
    getDocuments("expense", id),
    getCurrentUser(),
  ]);

  if (!expense) {
    notFound();
  }

  const canApprove = currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {expense.expense_number}
            </h1>
            <StatusBadge status={expense.status} />
          </div>
          <p className="text-muted-foreground">{expense.title}</p>
        </div>
        
        {canApprove && (
          <ExpenseActions 
            expenseId={expense.id} 
            currentStatus={expense.status} 
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Expense Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expense.items?.map((item, index) => (
                  <div key={item.id} className="flex justify-between items-center pb-3 border-b last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {index + 1}
                      </div>
                      <span className="font-medium">{item.description}</span>
                    </div>
                    <span className="font-semibold text-right">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t flex justify-between items-center">
                <span className="text-muted-foreground font-medium">Total Amount</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(expense.total_amount)}
                </span>
              </div>
            </CardContent>
          </Card>

          {expense.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Description & Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {expense.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-muted-foreground mb-1">Submitted By</div>
                  <div className="font-medium">{expense.employee?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{expense.employee?.employee_id}</div>
                </div>
              </div>

              <Separator />

              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-muted-foreground mb-1">Date Submitted</div>
                  <div className="font-medium">{formatDate(expense.submitted_at)}</div>
                </div>
              </div>

              <Separator />

              <div className="flex items-start gap-3">
                <Receipt className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-muted-foreground mb-1">Category</div>
                  <div className="font-medium capitalize">{expense.category}</div>
                </div>
              </div>

              {expense.work_order && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-muted-foreground mb-1">Linked Work Order</div>
                      <Link 
                        href={`/work-orders/${expense.work_order.id}`}
                        className="font-medium text-amber-600 hover:underline"
                      >
                        {expense.work_order.work_order_number}
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <DocumentVault 
            entityType="expense" 
            entityId={expense.id} 
            initialDocuments={documents ?? []} 
          />
        </div>
      </div>
    </div>
  );
}
