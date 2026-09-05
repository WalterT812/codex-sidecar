/** Drains already-started work before a single-writer lock may be released. */
export class WorkGroup {
  #closed = false;
  #pending = new Set<Promise<unknown>>();
  run<T>(action: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('Companion is stopping.'));
    const promise = Promise.resolve().then(action);
    this.#pending.add(promise);
    void promise.then(() => this.#pending.delete(promise), () => this.#pending.delete(promise));
    return promise;
  }
  async stop() { this.#closed = true; await Promise.allSettled([...this.#pending]); }
}
