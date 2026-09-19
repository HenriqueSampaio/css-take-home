"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; match: string[] };

/** Top-bar destinations as pills. Current: tinted blue. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {items.map((item) => {
        const current = item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`flex h-9 items-center rounded-full px-3.5 text-[0.9375rem] font-semibold transition-colors duration-150 ${current ? "bg-brand-tint text-brand-deep" : "text-ink-2 hover:bg-fill hover:text-ink"}`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
