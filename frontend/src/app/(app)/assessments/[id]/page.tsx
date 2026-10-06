import { AssessmentWorkspace } from "@/components/assessment/workspace";

export default async function AssessmentWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentWorkspace assessmentId={id} />;
}
