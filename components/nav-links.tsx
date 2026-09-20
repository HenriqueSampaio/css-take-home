"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; match: string[] };

/** The title block's navigation field. Current page: ink text and a Prussian underline. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex h-full flex-wrap items-stretch gap-x-1">
      {items.map((item) => {
        const current = item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
        return (
          <li key={item.href} className="flex">
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`relative flex min-h-11 items-center px-3 text-[0.9375rem] transition-colors duration-150 hover:text-ink ${current ? "font-semibold text-ink" : "font-medium text-ink-2"}`}
            >
              {item.label}
              <span aria-hidden className={`absolute inset-x-3 bottom-0 h-0.5 transition-colors duration-150 ${current ? "bg-prussian" : "bg-transparent"}`} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
