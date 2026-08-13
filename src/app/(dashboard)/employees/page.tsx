import Link from "next/link";
import { Plus, Users } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { DEPARTMENTS, ROLE_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Employees",
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    role?: string;
    department?: string;
    status?: string;
  }>;
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [{ data: employees }, currentUser] = await Promise.all([
    getEmployees(params),
    getCurrentUser(),
  ]);

  const isAdmin = currentUser?.role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your team members and their information"
      >
        {isAdmin && (
          <Link href="/employees/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Link>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="flex-1 flex gap-3">
          <Input
            name="search"
            placeholder="Search by name, email, or ID..."
            defaultValue={params.search ?? ""}
            className="max-w-sm"
          />
          <Select name="role" defaultValue={params.role ?? ""}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="department" defaultValue={params.department ?? ""}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map((dept) => (
                <SelectItem key={dept.value} value={dept.value}>
                  {dept.label}
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
      {!employees || employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees found"
          description="Get started by adding your first team member."
        >
          {isAdmin && (
            <Link href="/employees/new" className={cn(buttonVariants())}>
              <Plus className="mr-2 h-4 w-4" />
              Add Employee
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="hidden sm:table-cell">ID</TableHead>
                <TableHead className="hidden md:table-cell">
                  Department
                </TableHead>
                <TableHead className="hidden md:table-cell">Role</TableHead>
                <TableHead className="hidden lg:table-cell">Joined</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => {
                const initials = emp.full_name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <Link
                        href={`/employees/${emp.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{emp.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {emp.email}
                          </p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-sm">
                      {emp.employee_code}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {emp.department ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize">
                      {emp.role}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatDate(emp.date_of_joining)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={emp.is_active ? "active" : "inactive"}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
