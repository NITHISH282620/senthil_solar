import { ProjectForm } from "@/components/forms/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/actions/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Project",
};

export default async function NewProjectPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    redirect("/projects");
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="New Project"
        description="Create a new field execution project."
        backHref="/projects"
      />
      <ProjectForm />
    </div>
  );
}
