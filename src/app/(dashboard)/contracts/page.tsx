import Link from "next/link";
import { Plus, Search, Filter, Briefcase } from "lucide-react";
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
import { getContracts } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contracts",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ContractsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const search = typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : undefined;

  const [currentUser, { data: contracts }] = await Promise.all([
    getCurrentUser(),
    getContracts({ search, status }),
  ]);

  const canCreate = currentUser?.role === "owner" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        description="Manage your project contracts and master service agreements."
      >
        {canCreate && (
          <Link href="/contracts/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            New Contract
          </Link>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search by title or contract number..."
                className="pl-9"
                defaultValue={search}
              />
            </div>
            <div className="flex gap-2">
              <Select name="status" defaultValue={status || "all"}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
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
              <TableHead>Contract</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts?.length === 0 || !contracts ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No contracts found.
                </TableCell>
              </TableRow>
            ) : (
              contracts?.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="font-medium hover:underline text-amber-600"
                    >
                      {contract.contract_number}
                    </Link>
                    <div className="text-sm font-medium line-clamp-1">
                      {contract.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Briefcase className="h-3 w-3 mr-1 text-muted-foreground" />
                      <span className="text-sm">{contract.company?.name || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      ₹{contract.contract_value?.toLocaleString()}
                    </div>
                    {contract.total_capacity_kw && (
                      <div className="text-xs text-muted-foreground">
                        {contract.total_capacity_kw} kW
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {contract.start_date ? formatDate(contract.start_date) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      to {contract.deadline_date ? formatDate(contract.deadline_date) : "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={contract.status} />
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
