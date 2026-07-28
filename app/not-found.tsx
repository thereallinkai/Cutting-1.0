import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main-content" className="auth-main">
      <div className="auth-card">
        <Compass size={30} aria-hidden="true" />
        <h1>That page isn&apos;t here.</h1>
        <p>The address may have changed. Your plan and check-ins are unaffected.</p>
        <Link className="button button-dark" href="/today">Go to Today</Link>
      </div>
    </main>
  );
}
