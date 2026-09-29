/**
 * Cache TTL em memoria com coalescencia de requisicoes.
 *
 * Duas chamadas simultaneas para a mesma chave compartilham uma unica ida ao
 * upstream, o que impede que uma rajada de clientes vire uma rajada de chamadas
 * na API externa. Entradas expiradas ainda servem como rede de seguranca quando
 * o upstream cai (stale-if-error).
 */
export class TtlCache {
  #entries = new Map();
  #inflight = new Map();
  #maxEntries;
  #hits = 0;
  #misses = 0;

  constructor({ maxEntries = 500 } = {}) {
    this.#maxEntries = maxEntries;
  }

  get stats() {
    const total = this.#hits + this.#misses;
    return {
      size: this.#entries.size,
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total ? Number((this.#hits / total).toFixed(3)) : 0,
    };
  }

  peek(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    return { value: entry.value, ageMs: Date.now() - entry.storedAt, fresh: Date.now() < entry.expiresAt };
  }

  set(key, value, ttlMs) {
    if (this.#entries.size >= this.#maxEntries && !this.#entries.has(key)) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.delete(key);
    this.#entries.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs });
  }

  /**
   * Resolve a chave pelo cache ou executa `producer`, coalescendo chamadas
   * concorrentes. Com `staleIfError`, uma falha do producer devolve o valor
   * vencido em vez de propagar o erro.
   */
  async resolve(key, ttlMs, producer, { staleIfError = true } = {}) {
    const cached = this.#entries.get(key);
    const now = Date.now();

    if (cached && now < cached.expiresAt) {
      this.#hits += 1;
      return { value: cached.value, cached: true, ageMs: now - cached.storedAt, stale: false };
    }

    const pending = this.#inflight.get(key);
    if (pending) {
      this.#hits += 1;
      const value = await pending;
      return { value, cached: true, ageMs: 0, stale: false };
    }

    this.#misses += 1;
    const task = (async () => producer())();
    this.#inflight.set(key, task);

    try {
      const value = await task;
      this.set(key, value, ttlMs);
      return { value, cached: false, ageMs: 0, stale: false };
    } catch (error) {
      if (staleIfError && cached) {
        return { value: cached.value, cached: true, ageMs: now - cached.storedAt, stale: true };
      }
      throw error;
    } finally {
      this.#inflight.delete(key);
    }
  }

  clear() {
    this.#entries.clear();
    this.#inflight.clear();
  }
}
