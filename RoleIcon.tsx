import { ROLES } from "@/lib/mock-data";
import type { RoleKey } from "@/lib/types";

export function RoleIcon({ role }: { role: RoleKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ROLES[role].icon} />
    </svg>
  );
}
