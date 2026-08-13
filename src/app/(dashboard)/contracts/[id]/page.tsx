import Link from "next/link";
import { notFound } from "next/navigation";
import { Edit, Briefcase, IndianRupee, MapPin, Building, Calendar, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getContract } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContractDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [currentUser, { data: contract, error }] = await Promise.all([
    getCurrentUser(),
    getContract(id),
  ]);

  if (error || !contract) {
    notFound();
  }

  const canEdit = currentUser?.role === "owner" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.title}
        description={`${contract.contract_number} • ${contract.company?.name}`}
        backHref="/contracts"
      >
        <div className="flex gap-2">
          {canEdit && (
            <Link
              href={`/contracts/${contract.id}/edit`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Contract
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="flex gap-4 items-center">
        <StatusBadge status={contract.status} className="text-sm px-3 py-1" />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-4 h-auto">
          <TabsTrigger value="overview" className="py-2.5">
            <Briefcase className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="sites" className="py-2.5">
            <MapPin className="h-4 w-4 mr-2" />
            Sites
          </TabsTrigger>
          <TabsTrigger value="billing" className="py-2.5">
            <IndianRupee className="h-4 w-4 mr-2" />
            Billing & Payments
          </TabsTrigger>
          <TabsTrigger value="documents" className="py-2.5">
            <FileText className="h-4 w-4 mr-2" />
            Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Contract Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Scope of Work</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {contract.scope_description || "No description provided."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Client Info</h4>
                      <Link href={`/companies/${contract.company_id}`} className="text-sm font-medium hover:underline text-primary">
                        {contract.company?.name}
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Timeline</h4>
                      <p className="text-sm text-muted-foreground">
                        Start: {contract.start_date ? formatDate(contract.start_date) : "—"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Deadline: {contract.deadline_date ? formatDate(contract.deadline_date) : "—"}
                      </p>
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
                  <h4 className="text-sm font-medium text-muted-foreground">Contract Value</h4>
                  <p className="text-xl font-bold text-emerald-600">
                    {contract.contract_value ? `₹${contract.contract_value.toLocaleString()}` : "—"}
                  </p>
                </div>
                {contract.total_capacity_kw && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Total Capacity</h4>
                    <p className="text-sm">{contract.total_capacity_kw} kW</p>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Payment Terms</h4>
                  <p className="text-sm">{contract.payment_terms_days} days</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Retention</h4>
                  <p className="text-sm">{contract.retention_percent}%</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Penalty per Day</h4>
                  <p className="text-sm">₹{contract.penalty_per_day}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sites" className="mt-6">
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Sites</CardTitle>
              <CardDescription className="mt-2">Sites will be linked to this contract soon.</CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <IndianRupee className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Billing & Invoices</CardTitle>
              <CardDescription className="mt-2">Contract invoices will be shown here.</CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Documents</CardTitle>
              <CardDescription className="mt-2">Contract documents will be shown here.</CardDescription>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
