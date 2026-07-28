import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Cutting Plan — Steady guidance for everyday meals",
    template: "%s — Cutting Plan",
  },
  description:
    "A calm meal-planning and habit-tracking companion with transparent estimates, daily check-ins, and weight-trend context.",
  applicationName: "Cutting Plan",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
  openGraph: {
    type: "website",
    title: "Cutting Plan",
    description: "Plan meals. Notice patterns. Adjust with care.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cutting Plan — Plan meals. Notice patterns. Adjust with care." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cutting Plan",
    description: "Plan meals. Notice patterns. Adjust with care.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1e9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
