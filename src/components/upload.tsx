import { ReliableUpload } from "./reliable-upload";
export function Upload({
  assignment,
  kind,
}: {
  assignment: string;
  kind: string;
}) {
  return (
    <ReliableUpload
      target={assignment}
      kind={kind === "VOICE" ? "VOICE" : "PRODUCT"}
    />
  );
}
