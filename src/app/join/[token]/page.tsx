import { StudentClassJoiner } from "@/features/classes/components/student-class-joiner";

export const dynamic = "force-dynamic";

export default async function JoinTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StudentClassJoiner token={token} />;
}
