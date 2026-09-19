/** A skeleton of the sheet, not a spinner: the page keeps its shape while the data arrives. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[120rem] flex-col gap-4" role="status" aria-label="Loading">
      <div className="h-14 w-64 animate-pulse bg-sheet-sunk" />
      <div className="sheet">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex border-b border-line last:border-b-0">
            <div className="h-14 w-[13.5rem] shrink-0 border-r-[1.5px] border-ink bg-sheet-sunk" />
            <div className="h-14 flex-1 animate-pulse bg-sheet-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
