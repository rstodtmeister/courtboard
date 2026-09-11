// Schedule from completion so slow requests never overlap.
export function startDisplayPolling(load: () => Promise<void>, onError: (error: unknown) => void) {
  const isVisible = () => document.visibilityState !== "hidden";
  let stopped = false;
  let running = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    if (stopped || running || !isVisible()) return;
    clearTimeout(timer);
    running = true;
    try { await load(); failures = 0; } catch (error) { failures++; if (!stopped) onError(error); }
    finally {
      running = false;
      if (!stopped && isVisible()) timer = setTimeout(refresh, Math.min(30_000, 5_000 * 2 ** Math.min(failures, 3)));
    }
  }
  function visibilityChanged() {
    clearTimeout(timer);
    if (isVisible()) void refresh();
  }
  document.addEventListener("visibilitychange", visibilityChanged);
  void refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
}
