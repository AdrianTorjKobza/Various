export type Listener<T> = (state: T, previous: T) => void;

/** Minimal observable store: immutable state, synchronous notifications. */
export class Store<T> {
  private state: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  update(updater: (state: T) => T): void {
    const previous = this.state;
    const next = updater(previous);
    if (next === previous) return;
    this.state = next;
    this.listeners.forEach((listener) => listener(next, previous));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
