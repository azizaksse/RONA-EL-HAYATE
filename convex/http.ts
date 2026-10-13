import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";

/**
 * Public storefront API, served at https://<deployment>.convex.site
 *   GET  /api/storefront   catalog, settings, delivery rates
 *   GET  /api/desks?carrier=&wilaya=
 *   POST /api/order        place an order (prices recomputed server-side)
 *   POST /api/abandon      save an unfinished checkout
 *   GET  /api/label?o=&t=  shipping label PDF (team only)
 */
const http = httpRouter();

function cors(req: Request): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") || "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0] || "";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}
function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req), ...extra } });
}
function clientIp(req: Request) {
  // The last x-forwarded-for hop is the one added by the platform edge; earlier entries can be forged by the client.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const parts = (req.headers.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}
/** Reject writes coming from other websites when ALLOWED_ORIGINS is set. */
function originBlocked(req: Request) {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.length || allowed.includes("*")) return false;
  const origin = req.headers.get("Origin");
  return !!origin && !allowed.includes(origin);
}
const preflight = httpAction(async (_ctx, req) => new Response(null, { status: 204, headers: cors(req) }));
for (const path of ["/api/storefront", "/api/order", "/api/abandon", "/api/desks", "/api/label"]) http.route({ path, method: "OPTIONS", handler: preflight });

http.route({
  path: "/api/storefront",
  method: "GET",
  handler: httpAction(async (ctx, req) => json(req, await ctx.runQuery(api.catalog.storefront, {}), 200, { "Cache-Control": "no-cache" })),
});

http.route({
  path: "/api/desks",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const u = new URL(req.url);
    const carrier = u.searchParams.get("carrier") as "yalidine" | "zr_express" | "noest" | "ecotrack" | null;
    const w = Number(u.searchParams.get("wilaya"));
    if (!carrier || !["yalidine", "zr_express", "noest", "ecotrack"].includes(carrier) || !w) return json(req, []);
    return json(req, await ctx.runQuery(api.shipping.stopDesks, { carrier, wilayaCode: w }), 200, { "Cache-Control": "public, max-age=300" });
  }),
});

http.route({
  path: "/api/order",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (originBlocked(req)) return json(req, { ok: false, error: "forbidden" }, 403);
    let body: any;
    try { body = JSON.parse(await req.text()); } catch { return json(req, { ok: false, error: "invalid" }, 400); }
    const s = (x: unknown, n = 200) => (typeof x === "string" ? x.slice(0, n) : undefined);
    const src = body?.source && typeof body.source === "object" ? body.source : {};
    const input = {
      name: s(body?.name, 80) ?? "", phone: s(body?.phone, 20) ?? "", phone2: s(body?.phone2, 20),
      wilayaCode: Number(body?.wilayaCode) || 0, commune: s(body?.commune, 80) ?? "", address: s(body?.address, 200),
      mode: body?.mode === "desk" ? ("desk" as const) : ("home" as const), stopDeskCode: s(body?.stopDeskCode, 40),
      items: Array.isArray(body?.items) ? body.items.slice(0, 20).map((i: any) => ({ productId: String(i?.productId ?? ""), qty: Number(i?.qty) || 1 })) : [],
      lang: s(body?.lang, 4), draftId: s(body?.draftId, 60), website: s(body?.website, 100),
      source: {
        utm_source: s(src.utm_source, 100), utm_medium: s(src.utm_medium, 100), utm_campaign: s(src.utm_campaign, 100), utm_content: s(src.utm_content, 100),
        fbclid: s(src.fbclid, 300), ttclid: s(src.ttclid, 300), fbc: s(src.fbc, 300), fbp: s(src.fbp, 100), landing: s(src.landing, 300), page: s(src.page, 300),
        userAgent: s(req.headers.get("user-agent") ?? undefined, 300),
      },
    };
    const r = await ctx.runMutation(internal.orders.createFromStorefront, { input, ip: clientIp(req) });
    if (!r.ok) return json(req, r, r.error === "limit" ? 429 : 422);
    return json(req, { ok: true, number: r.number, subtotal: r.subtotal, shipping: r.shipping, total: r.total, items: r.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, productId: i.productId })) });
  }),
});

http.route({
  path: "/api/abandon",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (originBlocked(req)) return json(req, { ok: false }, 403);
    try {
      const b = JSON.parse(await req.text());
      if (typeof b?.draftId === "string" && typeof b?.phone === "string") {
        await ctx.runMutation(internal.abandoned.upsert, {
          ip: clientIp(req),
          draftId: b.draftId.slice(0, 60), phone: b.phone.slice(0, 20), name: typeof b.name === "string" ? b.name.slice(0, 80) : undefined,
          wilayaCode: Number(b.wilayaCode) || undefined, commune: typeof b.commune === "string" ? b.commune.slice(0, 80) : undefined,
          items: Array.isArray(b.items) ? b.items.slice(0, 20).map((i: any) => ({ productId: String(i?.productId ?? ""), qty: Number(i?.qty) || 1 })) : [],
          page: typeof b.page === "string" ? b.page.slice(0, 200) : undefined, lang: typeof b.lang === "string" ? b.lang.slice(0, 4) : undefined,
        });
      }
    } catch { /* ignore malformed drafts */ }
    return json(req, { ok: true });
  }),
});

http.route({
  path: "/api/label",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const key = new URL(req.url).searchParams.get("k") || "";
    const id = key ? await ctx.runMutation(internal.dispatch.useLabelToken, { token: key }) : null;
    if (!id) return new Response("This label link expired. Open it again from the admin.", { status: 401 });
    try {
      const pdf = await ctx.runAction(internal.dispatch.labelPdf, { id });
      if (!pdf) return new Response("No label for this order", { status: 404 });
      return new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=label.pdf", "Cache-Control": "no-store" } });
    } catch (e: any) {
      return new Response("Carrier error: " + (e?.message ?? e), { status: 502 });
    }
  }),
});

export default http;
