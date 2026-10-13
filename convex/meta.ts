/**
 * Meta Conversions API — reports real outcomes so ads optimise on sales, not clicks.
 *   Lead            order placed on the site (deduplicated with the browser pixel via event_id)
 *   Purchase        order confirmed by phone (value = order total)
 *   OrderDelivered  parcel delivered (custom event, usable for custom conversions / audiences)
 * Keys: META_ACCESS_TOKEN, META_PIXEL_ID (or the pixel id in settings), optional META_TEST_EVENT_CODE — from Convex env
 * vars or the admin's Delivery → API Keys → Meta (env wins). Optional env META_API_VERSION.
 */
import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { e164, normKey, splitName, wilayaName } from "./lib/util";
import { getSettings } from "./settings";

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const eventContext = internalQuery({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => {
    const o = await ctx.db.get(id);
    if (!o) return null;
    const s = await getSettings(ctx);
    const row = await ctx.db.query("carrierKeys").withIndex("by_carrier", (q) => q.eq("carrier", "meta")).first();
    const k = (row?.keys ?? {}) as Record<string, string>;
    return {
      o,
      pixel: process.env.META_PIXEL_ID || k.META_PIXEL_ID || s.fbPixelId || null,
      token: process.env.META_ACCESS_TOKEN || k.META_ACCESS_TOKEN || "",
      testCode: process.env.META_TEST_EVENT_CODE || k.META_TEST_EVENT_CODE || "",
    };
  },
});

export const sendOrderEvent = internalAction({
  args: { orderId: v.id("orders"), event: v.union(v.literal("Lead"), v.literal("Purchase"), v.literal("OrderDelivered")) },
  handler: async (ctx, { orderId, event }) => {
    const c = await ctx.runQuery(internal.meta.eventContext, { id: orderId });
    if (!c?.token || !c.pixel) return;
    const { o, token } = c;
    const n = splitName(o.name);
    const user_data: Record<string, unknown> = {
      ph: [await sha(e164(o.phone))],
      external_id: [await sha(o.phone)],
      fn: [await sha(n.first)],
      ln: [await sha(n.last)],
      ct: [await sha(normKey(o.commune).replace(/\s+/g, ""))],
      st: [await sha(normKey(wilayaName(o.wilayaCode, "fr")).replace(/\s+/g, ""))],
      country: [await sha("dz")],
    };
    if (o.source.ip) user_data.client_ip_address = o.source.ip;
    if (o.source.userAgent) user_data.client_user_agent = o.source.userAgent;
    if (o.source.fbc) user_data.fbc = o.source.fbc;
    if (o.source.fbp) user_data.fbp = o.source.fbp;
    const payload: Record<string, unknown> = {
      data: [{
        event_name: event,
        event_time: Math.floor((event === "Lead" ? o._creationTime : Date.now()) / 1000),
        event_id: `${o.number}-${event}`,
        action_source: "website",
        event_source_url: o.source.page || o.source.landing || undefined,
        user_data,
        custom_data: {
          currency: "DZD", value: o.total, order_id: o.number, content_type: "product",
          content_ids: o.items.map((i) => i.productId ?? i.name),
          contents: o.items.map((i) => ({ id: i.productId ?? i.name, quantity: i.qty, item_price: i.price })),
          num_items: o.items.reduce((s, i) => s + i.qty, 0),
        },
      }],
    };
    if (c.testCode) payload.test_event_code = c.testCode;
    const ver = process.env.META_API_VERSION || "v23.0";
    const res = await fetch(`https://graph.facebook.com/${ver}/${c.pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      await ctx.runMutation(internal.orders.setMetaFlag, { id: orderId, flag: event === "Lead" ? "lead" : event === "Purchase" ? "purchase" : "delivered" });
    } else {
      console.warn("Meta CAPI", event, o.number, res.status, (await res.text()).slice(0, 300));
    }
  },
});
