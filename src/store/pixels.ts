import { FB_PIXEL, TT_PIXEL } from "../lib/config";
import { lsGet, lsSet } from "../lib/storage";
import type { StoreInfo } from "./types";

declare global { interface Window { fbq?: any; _fbq?: any; ttq?: any; TiktokAnalyticsObject?: string } }

function cookie(n: string) { const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : undefined; }

/** Remember ad click ids / UTM tags from the landing URL for 7 days. */
export function captureSource() {
  const q = new URLSearchParams(location.search), src: Record<string, any> = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "ttclid"].forEach((k) => { if (q.get(k)) src[k] = q.get(k); });
  if (Object.keys(src).length) { src.landing = location.href.slice(0, 300); src.at = Date.now(); lsSet("ronaq_src", src); }
}
export function attribution() {
  let s = lsGet<Record<string, any>>("ronaq_src", {}); if (s.at && Date.now() - s.at > 7 * 864e5) s = {};
  const fbc = cookie("_fbc") || (s.fbclid ? "fb.1." + (s.at || Date.now()) + "." + s.fbclid : undefined);
  return { utm_source: s.utm_source, utm_medium: s.utm_medium, utm_campaign: s.utm_campaign, utm_content: s.utm_content, fbclid: s.fbclid, ttclid: s.ttclid, landing: s.landing, fbc, fbp: cookie("_fbp"), page: location.href.slice(0, 300) };
}

let fbStarted = false;
let ttStarted = false;
export function initPixels(S: StoreInfo) {
  const fb = S.fbPixelId || FB_PIXEL, tt = S.tiktokPixelId || TT_PIXEL;
  if (fb && !fbStarted) {
    fbStarted = true;
    /* eslint-disable */
    (function (f: any, b: Document, e: string, v: string) { if (f.fbq) return; const n: any = (f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }); if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = []; const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v; const s = b.getElementsByTagName(e)[0]; s.parentNode!.insertBefore(t, s); })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", fb); window.fbq("track", "PageView");
    /* eslint-enable */
  }
  if (tt && !ttStarted) {
    ttStarted = true;
    /* eslint-disable */
    (function (w: any, d: Document, t: string) { w.TiktokAnalyticsObject = t; const ttq = (w[t] = w[t] || []); ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"]; ttq.setAndDefer = function (t: any, e: string) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; }; for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.load = function (e: string) { const n = "https://analytics.tiktok.com/i18n/pixel/events.js"; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = n; ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); const o = d.createElement("script"); o.type = "text/javascript"; o.async = true; o.src = n + "?sdkid=" + e + "&lib=" + t; const a = d.getElementsByTagName("script")[0]; a.parentNode!.insertBefore(o, a); }; ttq.load(tt); ttq.page(); })(window, document, "ttq");
    /* eslint-enable */
  }
}

const TT: Record<string, string> = { ViewContent: "ViewContent", AddToCart: "AddToCart", InitiateCheckout: "InitiateCheckout", Lead: "PlaceAnOrder" };
export function track(ev: string, d: { value?: number; ids?: string[]; eventID?: string } = {}) {
  const pl = { value: d.value || 0, currency: "DZD", content_ids: d.ids || [], content_type: "product" };
  try { if (window.fbq) window.fbq("track", ev, pl, d.eventID ? { eventID: d.eventID } : undefined); } catch { /* ignore */ }
  try { if (window.ttq) window.ttq.track(TT[ev] || ev, { value: pl.value, currency: "DZD", contents: (d.ids || []).map((id) => ({ content_id: id })) }, d.eventID ? { event_id: d.eventID } : undefined); } catch { /* ignore */ }
}
