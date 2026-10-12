declare const __CONVEX_URL__: string;
declare const __CONVEX_SITE__: string;
declare const __FB_PIXEL__: string;
declare const __TT_PIXEL__: string;

/** Convex client URL (admin panel, websocket) and HTTP actions URL (storefront API). Set via env, see vite.config.ts. */
export const CONVEX_URL = __CONVEX_URL__;
export const SITE = __CONVEX_SITE__.replace(/\/+$/, "");
/** No backend configured → the store runs on data/demo.json and orders are not sent. */
export const DEMO = !SITE;
export const DEFAULT_LANG: Lang = "ar";
/** Fallback pixel ids from the build env (.env.production), used when the admin setting is empty. */
export const FB_PIXEL = __FB_PIXEL__;
export const TT_PIXEL = __TT_PIXEL__;

export type Lang = "ar" | "fr";
