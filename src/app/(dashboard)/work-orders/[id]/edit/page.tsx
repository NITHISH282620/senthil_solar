import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { WorkOrderForm } from "@/components/forms/work-order-form";
import { getWorkOrder } from "@/actions/work-orders";
import { getCustomersForDropdown, getQuotations } from "@/actions/quotations";
import { getCurrentUser } from "@/actions/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Work Order",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditWorkOrderPage({ params }: PageProps) {
  const { id } = await params;
  
  const [woRes, customersRes, quotationsRes, currentUser] = await Promise.all([
    getWorkOrder(id),
    getCustomersForDropdown(),
    getQuotations({ status: "approved" }), // Maybe we should fetch all if it's already linked to a non-approved one, but approved is standard for linking new
    getCurrentUser(),
  ]);

  if (!woRes.data) {
    notFound();
  }
  
  if (currentUser?.role !== "admin" && currentUser?.role !== "manager") {
    // Basic UI guard; Server Action enforces proper auth
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to edit work orders.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Edit ${woRes.data.work_order_number}`} 
        description="Update work order details and schedule."
      />
      
      <div className="max-w-3xl">
        <WorkOrderForm 
          initialData={woRes.data}
          customers={customersRes.data ?? []}
          quotations={quotationsRes.data ?? []}
        />
      </div>
    </div>
  );
}
