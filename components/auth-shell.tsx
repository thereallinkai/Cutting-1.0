import Link from "next/link";
import { Leaf } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link className="brand" href="/" aria-label="Cutting Plan home">
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={19} />
          </span>
          Cutting Plan
        </Link>
        <div className="auth-quote">
          <p>A useful plan should make your day feel clearer, not smaller.</p>
          <small>
            Your data, app calculations, and AI suggestions stay visibly
            separated so you can make informed choices.
          </small>
        </div>
        <small>General wellness guidance · Not medical advice</small>
      </aside>
      <main id="main-content" className="auth-main">
        {children}
      </main>
    </div>
  );
}
