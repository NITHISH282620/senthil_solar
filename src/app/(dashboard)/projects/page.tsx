import Link from "next/link";
import { Plus, Search, Filter, MapPin } from "lucide-react";
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
import { getProjects } from "@/actions/projects";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PROJECT_STATUSES } from "@/lib/constants";
import type { Metadata } from "next";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = {
  title: "Projects",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const search = typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : undefined;
  const district = typeof resolvedParams.district === "string" ? resolvedParams.district : undefined;

  const [currentUser, { data: projects }] = await Promise.all([
    getCurrentUser(),
    getProjects({ search, status, district }),
  ]);

  const canCreate = currentUser?.role === "admin" || currentUser?.role === "manager";

  // Get unique districts for the filter
  const uniqueDistricts = Array.from(new Set(projects?.map(p => p.district).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage your field execution sites and tracking."
      >
        {canCreate && (
          <Link href="/projects/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
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
                placeholder="Search by name, code, or client..."
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
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {uniqueDistricts.length > 0 && (
                <Select name="district" defaultValue={district || "all"}>
                  <SelectTrigger className="w-[150px]">
                    <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="District" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Districts</SelectItem>
                    {uniqueDistricts.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <Button type="submit" variant="secondary">Filter</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No projects found.
                </TableCell>
              </TableRow>
            ) : (
              projects?.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium hover:underline text-amber-600"
                    >
                      {project.project_code}
                    </Link>
                    <div className="text-sm font-medium line-clamp-1">
                      {project.name}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {project.client_company}
                    </div>
                  </TableCell>
                  <TableCell>
                    {project.district ? (
                      <div className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1 text-muted-foreground" />
                        <span className="text-sm">{project.district}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Not specified</span>
                    )}
                  </TableCell>
                  <TableCell className="w-[200px]">
                    <div className="flex items-center gap-2">
                      <Progress value={project.progress_percent} className="h-2" />
                      <span className="text-xs text-muted-foreground w-8">
                        {project.progress_percent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {project.start_date ? formatDate(project.start_date) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      to {project.expected_end_date ? formatDate(project.expected_end_date) : "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
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
