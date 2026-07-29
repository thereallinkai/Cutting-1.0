import type { Metadata } from "next";
import Link from "next/link";
import { BrandLink } from "@/components/brand-link";
import { BRAND } from "@/src/lib/brand";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function PrivacyPage() {
  return (
    <main id="main-content" className="legal-page">
      <header>
        <BrandLink />
        <Link className="text-link" href="/register">Back to signup</Link>
      </header>
      <p className="eyebrow">Version 1.1 · July 28, 2026</p>
      <h1>Privacy Notice</h1>
      <p>
        This notice explains the data {BRAND.name} needs for account access, meal
        planning, check-ins, and trend calculations. The product is designed to
        collect only information needed for those features.
      </p>
      <h2>Information you provide</h2>
      <p>
        Account details, preferences, goals, optional safety context, meal
        check-ins, weight entries, user-entered food-label facts, and optional
        label photos are stored with your account. Label photos are kept in
        private storage and are not shown to other users. Passwords are handled
        by Supabase Auth and are never stored in {BRAND.name} business tables.
      </p>
      <h2>Food sources and reusable product facts</h2>
      <p>
        A food search may send a search term or barcode from the server to USDA
        FoodData Central or Open Food Facts. The app stores the returned product
        facts with their source and verification status. When you confirm an
        uploaded label that has a barcode, a normalized product record may be
        added to the shared catalog as pending review so another user can find
        the product. The shared record does not include your account identity or
        raw label photo.
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
        Settings provides an account-data export. Account deletion is visibly
        unavailable in this development build and the interface does not claim
        otherwise. A production operator must implement deletion and publish
        completed contact, retention, subprocessors, and jurisdiction details
        before a public launch.
      </p>
      <h2>Location and external maps</h2>
      <p>
        Device time-zone detection uses browser-provided time-zone settings and
        does not require precise location permission. Nearby-shopping shortcuts
        open Google Maps in a new tab. {BRAND.name} does not receive the location
        or search results from that external page and does not verify inventory.
      </p>
    </main>
  );
}
