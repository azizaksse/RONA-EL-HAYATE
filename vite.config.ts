import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Convex URLs come from the environment, never from committed code you edit by hand:
 *   dev   → .env.local (written by `convex dev`)
 *   build → .env.production, or CONVEX_URL / CONVEX_SITE_URL set in Vercel.
 * Only these two values reach the browser bundle (a deploy key in the same env stays server-side).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), serviceWorker(), earlyCatalog(env.CONVEX_SITE_URL || ""), earlyPixel(env.FB_PIXEL_ID || ""), siteMeta(env.SITE_URL || "")],
    define: {
      __CONVEX_URL__: JSON.stringify(env.CONVEX_URL || ""),
      __CONVEX_SITE__: JSON.stringify(env.CONVEX_SITE_URL || ""),
      __FB_PIXEL__: JSON.stringify(env.FB_PIXEL_ID || ""),
      __TT_PIXEL__: JSON.stringify(env.TIKTOK_PIXEL_ID || ""),
      __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
    },
    server: { port: 5173 },
    build: { target: ["es2020", "chrome80", "safari14"] },
  };
});

/**
 * Start downloading the catalog from the HTML itself, in parallel with the app bundle
 * (instead of after it): saves one full round trip on 3G/4G. src/store/api.ts picks it up.
 */
function earlyCatalog(site: string): Plugin {
  const s = site.replace(/\/+$/, "");
  return {
    name: "ronaq-early-catalog",
    transformIndexHtml() {
      if (!s) return [];
      return [
        { tag: "link", attrs: { rel: "preconnect", href: s, crossorigin: "" }, injectTo: "head-prepend" },
        { tag: "script", children: `if(!/^\\/admin/.test(location.pathname)){window.__sf=fetch(${JSON.stringify(s + "/api/storefront")},{credentials:"omit",cache:"no-store"}).then(function(r){if(!r.ok)throw r.status;return r.json()});window.__sf.catch(function(){})}`, injectTo: "head-prepend" },
      ];
    },
  };
}

/**
 * Standard Meta pixel snippet in the HTML (outside /admin), so PageView fires before the app loads
 * and pixel checkers find it. src/store/pixels.ts skips re-initialising this same pixel.
 */
function earlyPixel(id: string): Plugin {
  const px = id.replace(/\D/g, "");
  return {
    name: "ronaq-early-pixel",
    transformIndexHtml() {
      if (!px) return [];
      return [
        { tag: "script", children: `if(!/^\\/admin/.test(location.pathname)){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${px}');fbq('track','PageView')}`, injectTo: "head" },
      ];
    },
  };
}

/** Share previews (Facebook, WhatsApp, TikTok), robots.txt and sitemap.xml, all built from SITE_URL. */
const PAGES = ["/", "/cart", "/delivery", "/returns", "/faq", "/contact", "/about", "/privacy", "/terms"];
function siteMeta(site: string): Plugin {
  const url = site.replace(/\/+$/, "");
  return {
    name: "ronaq-site-meta",
    transformIndexHtml(html) {
      if (!url) return html.replace(/<!--SEO-->[\s\S]*?<!--\/SEO-->/, "");
      return html.replace(/%SITE_URL%/g, url);
    },
    generateBundle() {
      const robots = "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /merci\n" + (url ? "\nSitemap: " + url + "/sitemap.xml\n" : "");
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      if (!url) return;
      const today = new Date().toISOString().slice(0, 10);
      const sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        PAGES.map((p) => `  <url><loc>${url}${p}</loc><lastmod>${today}</lastmod></url>`).join("\n") + "\n</urlset>\n";
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sm });
    },
  };
}

/** Emit sw.js with a version derived from the build so every deploy refreshes phone caches. */
function serviceWorker(): Plugin {
  return {
    name: "ronaq-sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle);
      const shell = files.filter((f) => /^assets\/index-.*\.(js|css)$/.test(f)).map((f) => "/" + f);
      const version = "ronaq-" + createHash("sha1").update(files.sort().join("|")).digest("hex").slice(0, 10);
      const src = readFileSync("src/sw.js", "utf8")
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace(/\[\s*"__SHELL__"\s*\]/, JSON.stringify(["/", ...shell]));
      this.emitFile({ type: "asset", fileName: "sw.js", source: src });
    },
  };
}
