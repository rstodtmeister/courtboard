// Schedule from completion so slow requests never overlap.
export function startDisplayPolling(load: () => Promise<void>, onError: (error: unknown) => void) {
  const isVisible = () => document.visibilityState !== "hidden";
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    if (stopped || running || !isVisible()) return;
    clearTimeout(timer);
    running = true;
    try { await load(); } catch (error) { if (!stopped) onError(error); }
    finally {
      running = false;
      if (!stopped && isVisible()) timer = setTimeout(refresh, 5_000);
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
