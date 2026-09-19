"use client";

import { useEffect } from "react";

/** The toast is a one-time acknowledgement: drop its flag from the address bar so a reload or a shared link does not replay it. */
export function FlashCleaner() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("flash")) return;
    url.searchParams.delete("flash");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
