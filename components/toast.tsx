import { Check } from "./icons";

/** A brief acknowledgement after a booking or a save. It removes itself; the page never waits on it. */
export function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="toast pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <p className="flex items-center gap-2.5 bg-ink py-2.5 pl-3 pr-5 text-[0.875rem] font-semibold text-sheet-raised shadow-[var(--shadow-float)]">
        <span className="grid h-6 w-6 place-items-center bg-clear text-sheet-raised"><Check size={14} /></span>
        {children}
      </p>
    </div>
  );
}
