"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useRecipeExit(active: boolean, busy: boolean, onDiscard: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const discard = useRef(onDiscard);
  const saving = useRef(busy);
  const allowUnload = useRef(false);
  const afterExit = useRef<(() => void) | null>(null);
  discard.current = onDiscard;
  saving.current = busy;

  const requestExit = useCallback(() => {
    if (!active || saving.current) return;
    afterExit.current = null;
    setConfirmOpen(true);
  }, [active]);
  const cancelExit = useCallback(() => {
    setConfirmOpen(false);
    afterExit.current = null;
  }, []);
  const confirmExit = () => {
    if (saving.current) return;
    allowUnload.current = true;
    const follow = afterExit.current;
    afterExit.current = null;
    setConfirmOpen(false);
    discard.current();
    follow?.();
  };

  useEffect(() => {
    if (!active) return;
    allowUnload.current = false;
    const previousState = window.history.state;
    const marker = crypto.randomUUID();
    const url = window.location.href;
    // Preserve Next.js router state in this temporary Back-button guard.
    const pushGuard = () => window.history.pushState(
      { ...previousState, supperbookEditor: marker }, "", url,
    );
    pushGuard();

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (allowUnload.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const pop = () => {
      if (window.history.state?.supperbookEditor === marker) return;
      pushGuard();
      requestExit();
    };
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      event.preventDefault();
      event.stopPropagation();
      requestExit();
      afterExit.current = () => window.location.assign(anchor.href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", pop);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", followLink, true);
      if (window.history.state?.supperbookEditor === marker) {
        window.history.replaceState(previousState, "", url);
        window.history.back();
      }
    };
  }, [active, requestExit]);

  return { requestExit, cancelExit, confirmExit, confirmOpen: active && confirmOpen };
}
