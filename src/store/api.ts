import { DEMO, SITE } from "../lib/config";
import { lsGet, lsSet } from "../lib/storage";
import type { StoreData } from "./types";

export function getJSON<T = any>(url: string, ms = 15000): Promise<T> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { credentials: "omit", signal: ctl.signal }).then(
    (r) => { clearTimeout(timer); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    (e) => { clearTimeout(timer); throw e; },
  );
}

const communeCache: Record<string, [string, string?][]> = {};
/** Communes of one wilaya: [latin name, arabic name]. */
export function communes(code: string | number) {
  const k = String(code);
  if (communeCache[k]) return Promise.resolve(communeCache[k]);
  return getJSON<[string, string?][]>("/data/communes/" + k + ".json", 12000).then((l) => (communeCache[k] = l));
}

declare const __BUILD_ID__: string;
/** Stale-while-revalidate: show the last catalog instantly, refresh it in the background. */
const CACHE_KEY = "ronaq_sf_" + (typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev");
export function loadStore(onFresh: (d: StoreData) => void): Promise<StoreData> {
  // Purge any old catalog keys from previous builds
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("ronaq_sf_") && k !== CACHE_KEY) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
  const cached = lsGet<{ at: number; d: StoreData } | null>(CACHE_KEY, null);
  const url = DEMO ? "/data/demo.json" : SITE + "/api/storefront";
  // The first request may already be in flight from index.html (see earlyCatalog in vite.config.ts).
  const early = (window as any).__sf as Promise<StoreData> | undefined; (window as any).__sf = undefined;
  const fresh = () => (early && !DEMO ? early.catch(() => getJSON<StoreData>(url, 15000)) : getJSON<StoreData>(url, 15000)).then((d) => { lsSet(CACHE_KEY, { at: Date.now(), d }); return d; });
  if (cached && cached.d) {
    if (Date.now() - cached.at > 60000) fresh().then(onFresh, () => {});
    return Promise.resolve(cached.d);
  }
  return fresh();
}

export type PostResult = { ok: boolean; error?: string; field?: string; [k: string]: any };
/** POST to the Convex HTTP API. Orders retry once on network failure; beacons fire and forget. */
export function post(path: string, body: unknown, beacon = false): Promise<PostResult> {
  const payload = JSON.stringify(body);
  if (beacon && navigator.sendBeacon) {
    try { navigator.sendBeacon(SITE + path, new Blob([payload], { type: "text/plain" })); return Promise.resolve({ ok: true }); } catch { /* fall through */ }
  }
  const attempt = (n: number): Promise<PostResult> => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
    return fetch(SITE + path, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: payload, keepalive: beacon, signal: ctl.signal }).then(
      (r) => { clearTimeout(timer); return r.json().catch(() => ({ ok: false, error: "net" })); },
      () => { clearTimeout(timer); if (n > 0) return new Promise((res) => setTimeout(res, 1500)).then(() => attempt(n - 1)); return { ok: false, error: "net" }; },
    );
  };
  return attempt(beacon ? 0 : 1);
}
