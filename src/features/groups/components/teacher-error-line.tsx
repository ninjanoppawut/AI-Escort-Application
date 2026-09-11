import { groupErrorCodeOf } from "../client/request";
import { presentTeacherGroupError } from "../teacher-actions";

export function TeacherErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  const presentation = presentTeacherGroupError(groupErrorCodeOf(error));
  return (
    <p
      className="border-border bg-background mt-3 rounded-lg border p-3 text-sm"
      role="alert"
    >
      <span className="font-semibold">{presentation.title}</span>{" "}
      {presentation.description}
    </p>
  );
}
