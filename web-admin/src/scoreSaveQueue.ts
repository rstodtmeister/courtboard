/** Serialize writes for one game without holding up other courts. */
export function createScoreSaveQueue() {
  const pending = new Map<string, Promise<void>>();

  return function enqueue<T>(gameId: string, save: () => Promise<T>): Promise<T> {
    const previous = pending.get(gameId) ?? Promise.resolve();
    const result = previous.then(save);
    const settled = result.then(release, release);
    pending.set(gameId, settled);

    function release() {
      // A failed request still releases the queue; report its error to its caller.
      // Do not discard a newer request that was enqueued while this one ran.
      if (pending.get(gameId) === settled) pending.delete(gameId);
    }

    return result;
  };
}
