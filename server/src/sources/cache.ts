export type CachedSourceValue<T> = {
  data: T;
  fetchedAt: string;
};

export class LastValidCache {
  readonly #values = new Map<string, CachedSourceValue<unknown>>();

  get<T>(key: string): CachedSourceValue<T> | undefined {
    return this.#values.get(key) as CachedSourceValue<T> | undefined;
  }

  set<T>(key: string, value: CachedSourceValue<T>): void {
    this.#values.set(key, value);
  }

  clear(): void {
    this.#values.clear();
  }
}
