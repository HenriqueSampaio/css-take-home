import { getAppMeta } from "@/lib/db/queries/meta";
import { requestDb } from "@/lib/ui/data";
import { DemoReset } from "./demo-reset";

export async function SiteFooter() {
  let changes: number | null = null;
  try {
    changes = (await getAppMeta(await requestDb())).mutationsSinceReset;
  } catch (error) {
    console.error("SiteFooter: database unavailable", error);
  }
  return (
    <footer className="mx-auto mt-12 max-w-[100rem] px-4 pb-8 text-[0.8125rem] text-ink-3 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4">
        <p>Open demo with shared, synthetic data. {changes !== null && <DemoReset changes={changes} />}</p>
        <p>Harborview Marine Research Center is a placeholder name. Not affiliated with any real institution.</p>
      </div>
    </footer>
  );
}
