"use client";

import { useEffect } from "react";

/**
 * Bloquea el scroll de fondo (html/body + workbench) sin recortar overlays.
 * Los SlideOver/Modal deben montarse en document.body vía portal.
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const body = document.body;
    const html = document.documentElement;
    const workbench = document.querySelector(
      ".flt-workbench",
    ) as HTMLElement | null;

    const scrollY = window.scrollY;
    const workbenchScrollTop = workbench?.scrollTop ?? 0;

    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow,
      workbenchOverflow: workbench?.style.overflow ?? "",
      workbenchOverscroll: workbench?.style.overscrollBehavior ?? "",
    };

    const scrollbarGap = window.innerWidth - html.clientWidth;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }

    // Congela el scroll del workbench sin usar overflow:hidden
    // (overflow:hidden recorta position:fixed hijos del árbol).
    if (workbench) {
      workbench.style.overscrollBehavior = "none";
      const onWheel = (e: Event) => e.preventDefault();
      const onTouchMove = (e: Event) => e.preventDefault();
      workbench.addEventListener("wheel", onWheel, { passive: false });
      workbench.addEventListener("touchmove", onTouchMove, { passive: false });
      workbench.scrollTop = workbenchScrollTop;

      return () => {
        html.style.overflow = prev.htmlOverflow;
        body.style.overflow = prev.bodyOverflow;
        body.style.position = prev.bodyPosition;
        body.style.top = prev.bodyTop;
        body.style.width = prev.bodyWidth;
        body.style.paddingRight = prev.bodyPaddingRight;
        workbench.style.overflow = prev.workbenchOverflow;
        workbench.style.overscrollBehavior = prev.workbenchOverscroll;
        workbench.removeEventListener("wheel", onWheel);
        workbench.removeEventListener("touchmove", onTouchMove);
        workbench.scrollTop = workbenchScrollTop;
        window.scrollTo(0, scrollY);
      };
    }

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      body.style.paddingRight = prev.bodyPaddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
