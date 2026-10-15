let installed = false;

/**
 * Last-resort logging for promise rejections nobody awaited. Without a handler
 * Node terminates the process (and every in-flight request with it). Call sites
 * should still catch their own errors; this only keeps a missed one from
 * taking the server down silently.
 */
export function installUnhandledRejectionLogger(label: string) {
  if (installed) return;
  installed = true;

  process.on("unhandledRejection", (reason) => {
    console.error(`[${label}] Unhandled promise rejection:`, reason);
  });
}
