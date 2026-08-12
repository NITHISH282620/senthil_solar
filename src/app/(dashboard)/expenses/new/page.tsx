import { PageHeader } from "@/components/shared/page-header";
import { ExpenseForm } from "@/components/forms/expense-form";
import { getProjects } from "@/actions/projects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit Expense",
};

export default async function NewExpensePage() {
  const { data: projects } = await getProjects();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submit Expense"
        description="Record a new expense claim for approval."
      />
      <div className="max-w-4xl">
        <ExpenseForm
          projects={(projects ?? []).map((p) => ({
            id: p.id,
            project_code: p.project_code,
            name: p.name,
          }))}
        />
      </div>
    </div>
  );
}
