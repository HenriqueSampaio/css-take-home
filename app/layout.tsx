import type { Metadata } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { TitleBlock } from "@/components/title-block";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const barlowSemi = Barlow_Semi_Condensed({ variable: "--font-barlow-semi", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Harborview Dock Schedule", template: "%s · Harborview Dock Schedule" },
  description: "Berth reservations for a marine research facility: no double-bookings, and every vessel checked against the length of its berth.",
  robots: { index: false, follow: false },
};

// Every page reads live, shared data and depends on today's date. Never prerender or cache one.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowSemi.variable}`}>
      <body className="antialiased">
        <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50">Skip to content</a>
        <TitleBlock />
        <main id="main" className="px-4 py-6 lg:px-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
