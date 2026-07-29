import { BRAND } from "@/src/lib/brand";

export default function Loading() {
  return (
    <main id="main-content" className="auth-main" aria-busy="true" aria-live="polite">
      <div className="auth-card">
        <p className="eyebrow">{BRAND.name}</p>
        <h1>Bringing your day into view…</h1>
        <div className="loading-bars" aria-hidden="true"><i /><i /><i /></div>
      </div>
    </main>
  );
}
