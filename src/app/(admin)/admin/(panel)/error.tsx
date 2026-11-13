"use client";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/admin/ui";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mt22">
      <EmptyState
        title="This page hit a snag"
        actions={
          <>
            <button type="button" className="btn p" onClick={() => retry()}>
              Try again
            </button>
            <Link className="btn" href="/admin">
              Back to overview
            </Link>
          </>
        }
      >
        Nothing was changed. If it keeps happening, check the server logs{error.digest ? ` (reference ${error.digest})` : ""}.
      </EmptyState>
    </div>
  );
}
