import Link from "next/link";
import { EmptyState } from "@/components/admin/ui";

export default function AdminNotFound() {
  return (
    <div className="card mt22">
      <EmptyState
        title="Not found"
        actions={
          <Link className="btn p" href="/admin">
            Back to overview
          </Link>
        }
      >
        This record doesn’t exist (anymore). It may have been deleted, or the link is mistyped.
      </EmptyState>
    </div>
  );
}
