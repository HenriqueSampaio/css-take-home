import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Harborview Dock Schedule", template: "%s · Harborview Dock Schedule" },
  description: "Berth reservations for a marine research facility: no double-bookings, and every vessel checked against the length of its berth.",
  robots: { index: false, follow: false },
};

// Every page reads live, shared data and depends on today's date. Never prerender or cache one.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50">Skip to content</a>
        <TopBar />
        <main id="main" className="mx-auto max-w-[100rem] px-4 pt-6 lg:px-8 lg:pt-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
