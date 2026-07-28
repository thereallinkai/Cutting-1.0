import type { Metadata } from "next";
import Link from "next/link";
import { Leaf } from "lucide-react";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function PrivacyPage() {
  return (
    <main id="main-content" className="legal-page">
      <header>
        <Link className="brand" href="/"><span className="brand-mark"><Leaf size={18} /></span>Cutting Plan</Link>
        <Link className="text-link" href="/register">Back to signup</Link>
      </header>
      <p className="eyebrow">Version 1.0 · July 24, 2026</p>
      <h1>Privacy Notice</h1>
      <p>
        This notice explains the data Cutting Plan needs for account access, meal
        planning, check-ins, and trend calculations. The product is designed to
        collect only information needed for those features.
      </p>
      <h2>Information you provide</h2>
      <p>
        Account details, preferences, goals, optional safety context, meal
        check-ins, weight entries, and user-entered food labels are stored with
        your account. Passwords are handled by Supabase Auth and are never stored
        in Cutting Plan business tables.
      </p>
      <h2>Calculated and suggested information</h2>
      <p>
        The app computes conversions, summaries, ranges, and trends. When you
        explicitly generate a plan, a minimized profile snapshot may be sent to
        the configured AI provider. The review screen shows what will be shared.
        Hidden model reasoning is not stored.
      </p>
      <h2>Development mode</h2>
      <p>
        Local development uses local Supabase, captured local email, seeded test
        accounts, and a deterministic mock AI provider. It does not send data to
        OpenAI unless a developer supplies credentials and explicitly enables real
        AI mode.
      </p>
      <h2>Control and retention</h2>
      <p>
        Settings provides export and deletion controls. A production operator must
        publish completed contact, retention, subprocessors, and jurisdiction
        details before a public launch.
      </p>
    </main>
  );
}
