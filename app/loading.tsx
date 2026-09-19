/** A still outline of the page while the data arrives: no spinner, no endless pulse. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[72rem] flex-col gap-4" role="status">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-72 bg-sheet-sunk" aria-hidden />
      <div className="h-4 w-[28rem] max-w-full bg-sheet-sunk" aria-hidden />
      <div className="sheet h-64" aria-hidden />
    </div>
  );
}
