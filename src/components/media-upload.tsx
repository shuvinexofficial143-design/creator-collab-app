import { ReliableUpload } from "./reliable-upload";
export function MediaUpload({ project }: { project: string }) {
  return <ReliableUpload target={project} kind="MEDIA" />;
}
