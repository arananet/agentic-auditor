const MAX_CACHE_SIZE = 200;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024; // 2 MB per entry

export class CacheManager {
  private cache = new Map<string, { data: any; expiry: number }>();

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  set(key: string, data: any, ttlSeconds: number = 3600): void {
    // Reject entries that would consume excessive memory (large HTML + base64 screenshots)
    if (JSON.stringify(data).length > MAX_ENTRY_BYTES) return;

    // Evict expired entries first, then oldest if still over limit
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const now = Date.now();
      Array.from(this.cache.entries()).forEach(([k, v]) => {
        if (now > v.expiry) this.cache.delete(k);
      });
      // If still at limit, delete the oldest entry (first inserted)
      if (this.cache.size >= MAX_CACHE_SIZE) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
    }
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }
}

export const globalCache = new CacheManager();
