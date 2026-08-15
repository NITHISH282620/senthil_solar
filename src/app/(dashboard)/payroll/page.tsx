import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { GeneratePayrollForm } from "@/components/shared/payroll-actions";
import { getPayrollRuns } from "@/actions/payroll";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payroll",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function PayrollPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!["owner", "manager", "accountant"].includes(currentUser.role)) {
    redirect("/unauthorized");
  }

  const { data: runs } = await getPayrollRuns();
  const rows = runs ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Built from attendance. Advances are recovered on finalising."
      >
        <GeneratePayrollForm />
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No payroll runs yet. Pick a month and build the first draft.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link
                          href={`/payroll/${run.id}`}
                          className="font-medium hover:underline"
                        >
                          {MONTHS[run.period_month - 1]} {run.period_year}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {run.employee_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(run.total_gross))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">
                        {formatCurrency(Number(run.total_deductions))}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(Number(run.total_net))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
