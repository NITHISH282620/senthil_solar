import { PageHeader } from "@/components/shared/page-header";
import { ExpenseForm } from "@/components/forms/expense-form";
import { getWorkOrders } from "@/actions/work-orders";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit Expense",
};

export default async function NewExpensePage() {
  const { data: workOrders } = await getWorkOrders();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Submit Expense" 
        description="Record a new expense claim for approval."
      />
      <div className="max-w-4xl">
        <ExpenseForm workOrders={workOrders ?? []} />
      </div>
    </div>
  );
}
