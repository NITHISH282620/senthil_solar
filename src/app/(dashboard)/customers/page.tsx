import Link from "next/link";
import { Plus, UserRoundSearch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EmptyState } from "@/components/shared/empty-state";
import { getCustomers } from "@/actions/customers";
import { getCurrentUser } from "@/actions/auth";
import { formatPhone } from "@/lib/format";
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customers",
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    source?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [{ data: customers }, currentUser] = await Promise.all([
    getCustomers(params),
    getCurrentUser(),
  ]);

  const canCreate =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage your customers and prospects"
      >
        {canCreate && (
          <Link href="/customers/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Link>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="flex-1 flex flex-wrap gap-3">
          <Input
            name="search"
            placeholder="Search by name, phone, email, city..."
            defaultValue={params.search ?? ""}
            className="max-w-sm"
          />
          <Select name="status" defaultValue={params.status ?? ""}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {CUSTOMER_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="source" defaultValue={params.source ?? ""}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {CUSTOMER_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </div>

      {/* Table */}
      {!customers || customers.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="No customers found"
          description="Start by adding your first customer."
        >
          {canCreate && (
            <Link href="/customers/new" className={cn(buttonVariants())}>
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">ID</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">City</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Assigned To
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((cust) => (
                <TableRow key={cust.id}>
                  <TableCell>
                    <Link
                      href={`/customers/${cust.id}`}
                      className="hover:underline"
                    >
                      <p className="font-medium">{cust.name}</p>
                      {cust.email && (
                        <p className="text-sm text-muted-foreground">
                          {cust.email}
                        </p>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-sm">
                    {cust.customer_id}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatPhone(cust.phone)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {cust.city ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {cust.assigned_profile?.full_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cust.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
