import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ExpenseForm } from "@/components/forms/expense-form";
import { getExpenseCategories } from "@/actions/cash-book";
import { getSiteOptions } from "@/actions/sites";
import { getCurrentUser } from "@/actions/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit Expense",
};

export default async function NewExpensePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [{ data: categories }, { data: sites }] = await Promise.all([
    getExpenseCategories(),
    getSiteOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submit Expense"
        description="Record what you spent on site. Attribute it to a site so it reaches that site's costs."
      />
      <div className="max-w-4xl">
        <ExpenseForm
          categories={categories ?? []}
          sites={(sites ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            company_name: s.company_name,
          }))}
        />
      </div>
    </div>
  );
}
