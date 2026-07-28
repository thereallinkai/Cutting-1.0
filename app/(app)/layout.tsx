import { redirect } from "next/navigation";
import { MobileNavigation, Sidebar } from "@/components/app-navigation";
import { getCurrentUser } from "@/src/lib/supabase/server";
import { isDevelopmentDemo } from "@/src/lib/env";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const demo = isDevelopmentDemo();
  if (!user && !demo) redirect("/login");

  const name = String(user?.user_metadata?.full_name ?? (demo ? "Jamie Rivera" : "Member"));
  const email = user?.email ?? "demo@cuttingplan.local";

  return (
    <div className="app-shell">
      <Sidebar name={name} email={email} />
      <main id="main-content" className="app-main">{children}</main>
      <MobileNavigation />
    </div>
  );
}
