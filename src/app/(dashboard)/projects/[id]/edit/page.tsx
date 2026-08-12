import { ProjectForm } from "@/components/forms/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/actions/auth";
import { getProject } from "@/actions/projects";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Project",
};

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const [currentUser, { data: project, error }] = await Promise.all([
    getCurrentUser(),
    getProject(id),
  ]);

  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    redirect(`/projects/${id}`);
  }

  if (error || !project) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Edit Project"
        description={`Editing details for ${project.project_code}`}
        backHref={`/projects/${id}`}
      />
      <ProjectForm initialData={project} />
    </div>
  );
}
