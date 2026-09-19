/**
 * The drafting revision mark: a triangle with a number means "this was marked up, check it".
 * Here the number is how many open review findings the thing carries.
 */
export function RevisionTriangle({ count, label, size = 22 }: { count: number; label?: string; size?: number }) {
  const text = count > 99 ? "99+" : String(count);
  return (
    <span className="inline-flex shrink-0 items-center text-caution" role="img" aria-label={label ?? `${count} open review ${count === 1 ? "finding" : "findings"}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable={false}>
        <path d="M12 2.8 22.4 21H1.6z" fill="var(--color-caution-tone)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
        <text x="12" y="18.2" textAnchor="middle" fontSize={text.length > 2 ? 7 : text.length > 1 ? 8.5 : 10} fontWeight="700" fill="currentColor" fontFamily="var(--font-data)">{text}</text>
      </svg>
    </span>
  );
}
