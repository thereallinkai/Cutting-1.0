"use client";

import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="auth-main">
      <div className="auth-card">
        <CircleAlert size={30} aria-hidden="true" />
        <h1>Something didn&apos;t load.</h1>
        <p>Your saved information has not been intentionally changed. Try this page again or return to Today.</p>
        <div className="header-actions">
          <button className="button button-dark" onClick={reset} type="button"><RotateCcw size={17} /> Try again</button>
          <Link className="button button-quiet" href="/today">Go to Today</Link>
        </div>
      </div>
    </main>
  );
}
