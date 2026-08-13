import { PageHeader } from "@/components/shared/page-header";
import { ExpenseForm } from "@/components/forms/expense-form";
import { getContracts } from "@/actions/contracts";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit Expense",
};

export default async function NewExpensePage() {
  const { data: contracts } = await getContracts();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submit Expense"
        description="Record a new expense claim for approval."
      />
      <div className="max-w-4xl">
        <ExpenseForm
          contracts={(contracts ?? []).map((c) => ({
            id: c.id,
            contract_number: c.contract_number,
            title: c.title,
          }))}
        />
      </div>
    </div>
  );
}
