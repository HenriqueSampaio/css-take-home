/** A still outline while data arrives: the page keeps its shape, nothing spins. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5" role="status">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-64 bg-sheet-sunk" aria-hidden />
      <div className="h-5 w-96 max-w-full bg-sheet-sunk" aria-hidden />
      <div className="sheet h-72" aria-hidden />
    </div>
  );
}
