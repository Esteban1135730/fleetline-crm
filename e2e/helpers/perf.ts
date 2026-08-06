import type { Page, Response } from "@playwright/test";

export type PerfSnapshot = {
  route: string;
  navigationMs: number;
  largestContentfulPaint?: number;
  firstInputDelay?: number;
  apiMaxMs: number;
  apiSamples: number;
};

const SLOW_PAGE_MS = 2000;

/**
 * Observa LCP / FID (cuando el browser lo expone) + latencia de respuestas API.
 */
export function attachPerfProbe(page: Page) {
  const apiDurations: number[] = [];

  const onResponse = async (res: Response) => {
    try {
      const url = res.url();
      if (!/localhost:4000|127\.0\.0\.1:4000/.test(url)) return;
      const timing = res.request().timing();
      const total =
        (timing.responseEnd || 0) > 0
          ? timing.responseEnd
          : (timing.responseStart || 0) + (timing.receiveHeadersEnd || 0);
      if (total > 0) apiDurations.push(total);
    } catch {
      /* ignore */
    }
  };

  page.on("response", onResponse);

  return {
    async measureNavigation(route: string): Promise<PerfSnapshot> {
      const t0 = Date.now();
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const navigationMs = Date.now() - t0;

      const webVitals = await page.evaluate(async () => {
        const out: {
          largestContentfulPaint?: number;
          firstInputDelay?: number;
        } = {};

        const paintEntries = performance.getEntriesByType(
          "paint",
        ) as PerformanceEntry[];
        const lcpEntries = performance.getEntriesByType(
          "largest-contentful-paint",
        ) as PerformanceEntry[];
        if (lcpEntries.length) {
          out.largestContentfulPaint = lcpEntries[lcpEntries.length - 1].startTime;
        } else {
          const fcp = paintEntries.find((e) => e.name === "first-contentful-paint");
          if (fcp) out.largestContentfulPaint = fcp.startTime;
        }

        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          try {
            const po = new PerformanceObserver((list) => {
              const last = list.getEntries().at(-1) as
                | PerformanceEventTiming
                | undefined;
              if (last && "processingStart" in last) {
                out.firstInputDelay = last.processingStart - last.startTime;
              }
              finish();
            });
            po.observe({ type: "first-input", buffered: true } as never);
            window.setTimeout(finish, 400);
          } catch {
            finish();
          }
        });

        return out;
      });

      const apiMaxMs = apiDurations.length
        ? Math.max(...apiDurations)
        : 0;

      const snap: PerfSnapshot = {
        route,
        navigationMs,
        largestContentfulPaint: webVitals.largestContentfulPaint,
        firstInputDelay: webVitals.firstInputDelay,
        apiMaxMs,
        apiSamples: apiDurations.length,
      };

      if (navigationMs > SLOW_PAGE_MS) {
        console.warn(
          `[PERF ALERT] ${route} navegación ${navigationMs}ms > ${SLOW_PAGE_MS}ms`,
        );
      }
      if (
        snap.largestContentfulPaint != null &&
        snap.largestContentfulPaint > SLOW_PAGE_MS
      ) {
        console.warn(
          `[PERF ALERT] ${route} LCP ${snap.largestContentfulPaint.toFixed(0)}ms > ${SLOW_PAGE_MS}ms`,
        );
      }
      if (apiMaxMs > SLOW_PAGE_MS) {
        console.warn(
          `[PERF ALERT] ${route} API max ${apiMaxMs.toFixed(0)}ms > ${SLOW_PAGE_MS}ms`,
        );
      }

      console.log(
        `[PERF] ${route} nav=${navigationMs}ms LCP=${snap.largestContentfulPaint?.toFixed(0) ?? "n/a"} FID=${snap.firstInputDelay?.toFixed(0) ?? "n/a"} apiMax=${apiMaxMs.toFixed(0)}ms (n=${apiDurations.length})`,
      );

      apiDurations.length = 0;
      return snap;
    },
    dispose() {
      page.off("response", onResponse);
    },
  };
}
