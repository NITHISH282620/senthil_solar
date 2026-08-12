import Link from "next/link";
import { notFound } from "next/navigation";
import { Edit, Users, Clock, Receipt, FileText, MapPin, Building, Calendar, CheckSquare, Briefcase } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getProject } from "@/actions/projects";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { ProjectTeamTab } from "./_components/project-team-tab";
// We will create placeholder components for these tabs for now
// import { ProjectWorkLogsTab } from "./_components/project-work-logs-tab";
// import { ProjectExpensesTab } from "./_components/project-expenses-tab";
// import { ProjectBillingTab } from "./_components/project-billing-tab";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [currentUser, { data: project, error }] = await Promise.all([
    getCurrentUser(),
    getProject(id),
  ]);

  if (error || !project) {
    notFound();
  }

  const canEdit = currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={`${project.project_code} • ${project.client_company}`}
        backHref="/projects"
      >
        <div className="flex gap-2">
          {canEdit && (
            <Link
              href={`/projects/${project.id}/edit`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Project
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="flex gap-4 items-center">
        <StatusBadge status={project.status} className="text-sm px-3 py-1" />
        {project.district && (
          <div className="flex items-center text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
            <MapPin className="h-4 w-4 mr-1" />
            {project.district}
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="py-2.5">
            <Briefcase className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="team" className="py-2.5">
            <Users className="h-4 w-4 mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="work-logs" className="py-2.5">
            <Clock className="h-4 w-4 mr-2" />
            Work Logs
          </TabsTrigger>
          <TabsTrigger value="expenses" className="py-2.5">
            <Receipt className="h-4 w-4 mr-2" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="billing" className="py-2.5">
            <FileText className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Scope of Work</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {project.scope_description || "No description provided."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Client Info</h4>
                      <p className="text-sm text-muted-foreground">{project.client_company}</p>
                      {project.client_contact_name && (
                        <p className="text-sm text-muted-foreground">{project.client_contact_name}</p>
                      )}
                      {project.client_contact_phone && (
                        <p className="text-sm text-muted-foreground">{project.client_contact_phone}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Location</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {project.site_address || "No address provided."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Timeline</h4>
                      <p className="text-sm text-muted-foreground">
                        Start: {project.start_date ? formatDate(project.start_date) : "—"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expected End: {project.expected_end_date ? formatDate(project.expected_end_date) : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="w-full">
                      <h4 className="text-sm font-medium mb-2">Progress</h4>
                      <div className="flex items-center gap-3">
                        <Progress value={project.progress_percent} className="h-2 flex-1" />
                        <span className="text-sm font-medium w-8">{project.progress_percent}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Commercials</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Rate Type</h4>
                  <p className="text-sm font-medium capitalize">{project.rate_type?.replace("_", " ") || "—"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Rate Amount</h4>
                  <p className="text-xl font-bold text-emerald-600">
                    {project.rate_amount ? `₹${project.rate_amount.toLocaleString()}` : "—"}
                  </p>
                </div>
                {project.rate_unit && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Unit</h4>
                    <p className="text-sm">{project.rate_unit}</p>
                  </div>
                )}
                {project.client_gst && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Client GST</h4>
                    <p className="text-sm font-mono">{project.client_gst}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <ProjectTeamTab project={project} currentUser={currentUser} />
        </TabsContent>

        <TabsContent value="work-logs" className="mt-6">
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Work Logs</CardTitle>
              <CardDescription className="mt-2">Work logs will be implemented in the next phase.</CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Expenses</CardTitle>
              <CardDescription className="mt-2">Project expenses will be shown here.</CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Billing & Invoices</CardTitle>
              <CardDescription className="mt-2">Project invoices will be shown here.</CardDescription>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
