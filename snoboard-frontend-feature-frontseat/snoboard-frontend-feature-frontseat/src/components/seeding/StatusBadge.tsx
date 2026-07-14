import { statusTone } from "@/services/seeding/constants";

export function StatusBadge({ status }: { status?: string }) {
  return <span className={`f-pill ${statusTone(status)}`}>{status || "—"}</span>;
}
export default StatusBadge;
