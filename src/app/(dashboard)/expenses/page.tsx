import Link from "next/link";
import { Plus, Search, Filter } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { getExpenses } from "@/actions/expenses";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Expenses",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const search = typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : undefined;

  const [currentUser, { data: expenses }] = await Promise.all([
    getCurrentUser(),
    getExpenses({ search, status }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track and manage company expenses."
      >
        <Link href="/expenses/new" className={cn(buttonVariants())}>
          <Plus className="mr-2 h-4 w-4" />
          Submit Expense
        </Link>
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search by expense number or title..."
                className="pl-9"
                defaultValue={search}
              />
            </div>
            <div className="flex gap-2">
              <Select name="status" defaultValue={status || "all"}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              
              <Button type="submit" variant="secondary">Filter</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense</TableHead>
              {currentUser?.role !== "worker" && <TableHead>Employee</TableHead>}
              <TableHead>Category</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={currentUser?.role !== "worker" ? 6 : 5} className="h-24 text-center text-muted-foreground">
                  No expenses found.
                </TableCell>
              </TableRow>
            ) : (
              expenses?.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>
                    <Link
                      href={`/expenses/${expense.id}`}
                      className="font-medium hover:underline text-amber-600"
                    >
                      {expense.expense_number}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {expense.title}
                    </div>
                  </TableCell>
                  {currentUser?.role !== "worker" && (
                    <TableCell>
                      {expense.employee?.full_name}
                      <div className="text-xs text-muted-foreground">
                        {expense.employee?.employee_code}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="capitalize">{expense.category}</TableCell>
                  <TableCell>
                    {formatDate(expense.created_at)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(expense.amount ?? 0)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={expense.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
