type WebVitalName = "CLS" | "FCP" | "INP" | "LCP" | "ROUTE";

type WebVitalPayload = {
  name: WebVitalName;
  value: number;
  path: string;
};

const reportedMetrics = new Set<string>();

export function reportWebVital({ name, value, path }: WebVitalPayload) {
  if (!Number.isFinite(value) || value < 0) return;

  const key = `${name}:${path}`;
  if (name !== "ROUTE" && reportedMetrics.has(key)) return;
  reportedMetrics.add(key);

  void fetch("/app/performance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      path,
      value: Number(value.toFixed(2)),
    }),
    keepalive: true,
  }).catch(() => {
    // Performance reporting must never affect app navigation.
  });
}

export function observeWebVitals(getPath: () => string) {
  if (typeof PerformanceObserver === "undefined") return () => {};

  const observers: PerformanceObserver[] = [];
  let clsValue = 0;
  let inpValue = 0;
  let lcpValue = 0;

  const observe = (
    type: string,
    callback: PerformanceObserverCallback,
    options: PerformanceObserverInit = { type, buffered: true },
  ) => {
    try {
      const observer = new PerformanceObserver(callback);
      observer.observe(options);
      observers.push(observer);
    } catch {
      // Older browsers can omit individual performance entry types.
    }
  };

  observe("paint", (list) => {
    const fcp = list.getEntries().find((entry) => entry.name === "first-contentful-paint");
    if (fcp) reportWebVital({ name: "FCP", value: fcp.startTime, path: getPath() });
  }, { type: "paint", buffered: true });

  observe("largest-contentful-paint", (list) => {
    const lastEntry = list.getEntries().at(-1);
    if (lastEntry) lcpValue = lastEntry.startTime;
  });

  observe("layout-shift", (list) => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
      if (!entry.hadRecentInput) clsValue += entry.value || 0;
    }
  });

  observe("event", (list) => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number }>) {
      inpValue = Math.max(inpValue, entry.duration || 0);
    }
  }, { type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);

  const flush = () => {
    const path = getPath();
    if (lcpValue > 0) reportWebVital({ name: "LCP", value: lcpValue, path });
    reportWebVital({ name: "CLS", value: clsValue, path });
    if (inpValue > 0) reportWebVital({ name: "INP", value: inpValue, path });
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", flush);

  return () => {
    flush();
    observers.forEach((observer) => observer.disconnect());
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", flush);
  };
}
