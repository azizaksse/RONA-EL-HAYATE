import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireMember } from "./lib/auth";
import { CARRIERS, getCarrier, injectKeys, type CarrierCode, type ShipmentInput } from "./lib/carriers";
import { normKey, productDescription, randomToken, shipWilaya } from "./lib/util";
import { wilaya } from "./lib/wilayas";
import { carrierCode } from "./schema";
import { getSettings } from "./settings";

/* ---------- what's connected ---------- */
export const carrierList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireMember(ctx, token);
    const s = await getSettings(ctx);
    const desks = await ctx.db.query("stopDesks").collect();
    const logs = await ctx.db.query("carrierLogs").order("desc").take(30);
    // Load DB keys so carrier.configured reflects DB-stored keys too
    const dbRows = await ctx.db.query("carrierKeys").collect();
    const dbKeys: Record<string, Record<string, string>> = {};
    for (const row of dbRows) dbKeys[row.carrier] = row.keys as Record<string, string>;
    injectKeys(dbKeys);
    return {
      defaultCarrier: s.defaultCarrier ?? null,
      carriers: CARRIERS.map((code) => {
        const c = getCarrier(code, dbKeys);
        return { code, label: c.label, configured: c.configured, stopDesks: desks.filter((d) => d.carrier === code).length };
      }),
      logs: logs.map((l) => ({ at: l._creationTime, carrier: l.carrier, kind: l.kind, ok: l.ok, message: l.message })),
      meta: { configured: !!(process.env.META_ACCESS_TOKEN && (process.env.META_PIXEL_ID || s.fbPixelId)), testMode: !!process.env.META_TEST_EVENT_CODE },
    };
  },
});

export const log = internalMutation({
  args: { carrier: carrierCode, kind: v.string(), ok: v.boolean(), message: v.string(), orderId: v.optional(v.id("orders")) },
  handler: async (ctx, a) => { await ctx.db.insert("carrierLogs", { ...a, message: a.message.slice(0, 400) }); },
});

export const testCarrier = action({
  args: { token: v.string(), carrier: carrierCode },
  handler: async (ctx, { token, carrier }): Promise<{ ok: boolean; message: string }> => {
    await ctx.runQuery(internal.auth.assertPerm, { token, perm: "settings" });
    const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
    const c = getCarrier(carrier, dbKeys);
    if (!c.configured) return { ok: false, message: "API keys are missing — add them in the Delivery tab or Convex environment variables" };
    const r = await c.test();
    await ctx.runMutation(internal.dispatch.log, { carrier, kind: "test", ok: r.ok, message: r.message });
    return r;
  },
});

/* ---------- dispatch ---------- */
export const dispatchContext = internalQuery({
  args: { id: v.id("orders"), carrier: carrierCode },
  handler: async (ctx, { id, carrier }) => {
    const o = await ctx.db.get(id);
    if (!o) return null;
    const s = await getSettings(ctx);
    const sw = shipWilaya(o.wilayaCode)!;
    let commune = o.commune;
    // Use the carrier's exact commune spelling when we synced it (Yalidine is strict).
    const geo = await ctx.db.query("carrierGeo").withIndex("by_carrier_wilaya_key", (q) => q.eq("carrier", carrier).eq("wilayaCode", sw.c).eq("key", normKey(o.commune))).first();
    if (geo) commune = geo.name;
    let weight = 0;
    for (const it of o.items) if (it.productId) { const p = await ctx.db.get(it.productId); if (p?.weightKg) weight += p.weightKg * it.qty; }
    return { order: o, settings: s, shipWilayaCode: sw.c, shipWilayaName: sw.n, commune, weight: weight ? Math.round(weight * 100) / 100 : undefined };
  },
});

async function dispatchOne(ctx: any, id: Id<"orders">, carrier: CarrierCode, stationCode: string | undefined, by: string) {
  const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
  const c = getCarrier(carrier, dbKeys);
  if (!c.configured) throw new ConvexError({ code: "not_configured", message: `${c.label} API keys are missing` });
  const dc = await ctx.runQuery(internal.dispatch.dispatchContext, { id, carrier });
  if (!dc) throw new ConvexError({ code: "not_found", message: "Order not found" });
  const o = dc.order;
  // A stop desk chosen on the storefront belongs to one carrier; don't send its code to another.
  let station = stationCode || undefined;
  if (!station && o.mode === "desk" && o.stopDeskCode) {
    if (o.stopDeskCarrier && o.stopDeskCarrier !== carrier) throw new ConvexError({ code: "desk", message: `Pick a ${c.label} stop desk for this order` });
    station = o.stopDeskCode;
  }
  await ctx.runMutation(internal.orders.claimDispatch, { id });
  const origin = wilaya(dc.settings.originWilaya);
  const input: ShipmentInput = {
    reference: o.number, name: o.name, phone: o.phone, phone2: o.phone2, address: o.address, wilayaCode: dc.shipWilayaCode,
    wilayaName: dc.shipWilayaName, commune: dc.commune, amount: o.total, description: productDescription(o.items, o.number),
    stopDesk: o.mode === "desk", stationCode: station, weight: dc.weight, canOpen: dc.settings.canOpenParcel,
    remarks: o.notes.length ? o.notes[o.notes.length - 1].text.slice(0, 200) : undefined, originWilayaName: origin?.n ?? "Alger",
  };
  try {
    const r = await c.create(input);
    await ctx.runMutation(internal.orders.markDispatched, { id, carrier, tracking: r.tracking, labelUrl: r.labelUrl, parcelId: r.parcelId, by, warning: r.warning });
    await ctx.runMutation(internal.dispatch.log, { carrier, kind: "create", ok: true, message: `${o.number} → ${r.tracking}`, orderId: id });
    return { ok: true as const, number: o.number, tracking: r.tracking };
  } catch (e: any) {
    const msg = e?.data?.message ?? e?.message ?? String(e);
    await ctx.runMutation(internal.orders.markDispatchError, { id, error: msg });
    await ctx.runMutation(internal.dispatch.log, { carrier, kind: "create", ok: false, message: `${o.number}: ${msg}`, orderId: id });
    return { ok: false as const, number: o.number, error: msg };
  }
}

export const dispatch = action({
  args: { token: v.string(), id: v.id("orders"), carrier: carrierCode, stationCode: v.optional(v.string()) },
  handler: async (ctx, a): Promise<{ ok: boolean; number: string; tracking?: string; error?: string }> => {
    await ctx.runQuery(internal.auth.assertPerm, { token: a.token, perm: "orders.ship" });
    const me = await ctx.runQuery(internal.auth.memberByToken, { token: a.token });
    return dispatchOne(ctx, a.id, a.carrier, a.stationCode, me?.name ?? "team");
  },
});

export const dispatchMany = action({
  args: { token: v.string(), ids: v.array(v.id("orders")), carrier: carrierCode },
  handler: async (ctx, a): Promise<{ ok: boolean; number: string; tracking?: string; error?: string }[]> => {
    await ctx.runQuery(internal.auth.assertPerm, { token: a.token, perm: "orders.ship" });
    const me = await ctx.runQuery(internal.auth.memberByToken, { token: a.token });
    const out = [];
    for (const id of a.ids.slice(0, 50)) {
      try { out.push(await dispatchOne(ctx, id, a.carrier, undefined, me?.name ?? "team")); }
      catch (e: any) { out.push({ ok: false, number: String(id), error: e?.data?.message ?? e?.message }); }
    }
    return out;
  },
});

export const cancelShipment = action({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, { token, id }): Promise<void> => {
    await ctx.runQuery(internal.auth.assertPerm, { token, perm: "orders.ship" });
    const me = await ctx.runQuery(internal.auth.memberByToken, { token });
    const o = await ctx.runQuery(internal.orders.forDispatch, { id });
    if (!o?.carrier || !o.tracking) throw new ConvexError({ code: "invalid", message: "This order has no shipment" });
    if (o.status !== "shipped") throw new ConvexError({ code: "invalid", message: "Only parcels still in transit can be cancelled" });
    const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
    const c = getCarrier(o.carrier, dbKeys);
    if (!c.cancel) throw new ConvexError({ code: "unsupported", message: `${c.label} doesn't allow cancelling by API — cancel it in their dashboard` });
    try { await c.cancel(o.tracking, o.carrierParcelId); }
    catch (e: any) { throw new ConvexError({ code: "carrier", message: e.message }); }
    await ctx.runMutation(internal.orders.clearShipment, { id, by: me?.name });
    await ctx.runMutation(internal.dispatch.log, { carrier: o.carrier, kind: "cancel", ok: true, message: `${o.number} ${o.tracking}`, orderId: id });
  },
});

export const mintLabelToken = internalMutation({
  args: { orderId: v.id("orders"), token: v.string() },
  handler: async (ctx, a) => { await ctx.db.insert("labelTokens", { ...a, expiresAt: Date.now() + 2 * 60 * 1000 }); },
});
export const useLabelToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const r = await ctx.db.query("labelTokens").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!r) return null;
    await ctx.db.delete(r._id);
    return r.expiresAt > Date.now() ? r.orderId : null;
  },
});

/** Returns a label URL. PDFs that need our carrier key go through /api/label with a one-time 2-minute key. */
export const label = action({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, { token, id }): Promise<{ url?: string; key?: string }> => {
    await ctx.runQuery(internal.auth.assertPerm, { token, perm: "view" });
    const o = await ctx.runQuery(internal.orders.forDispatch, { id });
    if (!o?.carrier || !o.tracking) throw new ConvexError({ code: "invalid", message: "No shipment yet" });
    if (o.carrier === "yalidine" && o.labelUrl) return { url: o.labelUrl };
    const proxy = async () => { const key = randomToken(24); await ctx.runMutation(internal.dispatch.mintLabelToken, { orderId: id, token: key }); return { key }; };
    if (o.carrier === "noest" || o.carrier === "ecotrack") return proxy();
    try {
      const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
      const l = await getCarrier(o.carrier, dbKeys).getLabel(o.tracking, o.carrierParcelId);
      return "url" in l ? { url: l.url } : proxy();
    } catch (e: any) { throw new ConvexError({ code: "carrier", message: e.message }); }
  },
});

/** Retry the validation step for NOEST / EcoTrack parcels created as drafts. */
export const revalidate = action({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, { token, id }): Promise<void> => {
    await ctx.runQuery(internal.auth.assertPerm, { token, perm: "orders.ship" });
    const o = await ctx.runQuery(internal.orders.forDispatch, { id });
    if (!o?.carrier || !o.tracking) throw new ConvexError({ code: "invalid", message: "No shipment yet" });
    const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
    const c = getCarrier(o.carrier, dbKeys);
    if (!c.validate) return;
    try { await c.validate(o.tracking); } catch (e: any) { throw new ConvexError({ code: "carrier", message: e.message }); }
    await ctx.runMutation(internal.orders.clearCarrierError, { id });
  },
});

/* ---------- stop desks & carrier geo ---------- */
export const replaceStopDesks = internalMutation({
  args: { carrier: carrierCode, desks: v.array(v.object({ code: v.string(), name: v.string(), wilayaCode: v.union(v.number(), v.null()), commune: v.optional(v.string()), address: v.optional(v.string()) })) },
  handler: async (ctx, { carrier, desks }) => {
    const old = await ctx.db.query("stopDesks").collect();
    for (const d of old) if (d.carrier === carrier) await ctx.db.delete(d._id);
    for (const d of desks) await ctx.db.insert("stopDesks", { carrier, code: d.code, name: d.name, wilayaCode: d.wilayaCode ?? undefined, commune: d.commune, address: d.address });
  },
});

export const replaceGeo = internalMutation({
  args: { carrier: carrierCode, rows: v.array(v.object({ wilayaCode: v.number(), name: v.string() })), first: v.boolean() },
  handler: async (ctx, { carrier, rows, first }) => {
    if (first) for (const g of await ctx.db.query("carrierGeo").collect()) if (g.carrier === carrier) await ctx.db.delete(g._id);
    for (const r of rows) await ctx.db.insert("carrierGeo", { carrier, wilayaCode: r.wilayaCode, name: r.name, key: normKey(r.name) });
  },
});

export const syncCarrierData = action({
  args: { token: v.string(), carrier: carrierCode },
  handler: async (ctx, { token, carrier }): Promise<{ desks: number; communes: number }> => {
    await ctx.runQuery(internal.auth.assertPerm, { token, perm: "settings" });
    const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
    const c = getCarrier(carrier, dbKeys);
    if (!c.configured) throw new ConvexError({ code: "not_configured", message: `${c.label} API keys are missing` });
    let desks = 0, communes = 0;
    try {
      const d = await c.stopDesks();
      await ctx.runMutation(internal.dispatch.replaceStopDesks, { carrier, desks: d.map((x) => ({ ...x, wilayaCode: x.wilayaCode ?? null })) });
      desks = d.length;
      if (c.communes) {
        const rows = await c.communes();
        for (let i = 0; i < rows.length; i += 400) await ctx.runMutation(internal.dispatch.replaceGeo, { carrier, rows: rows.slice(i, i + 400), first: i === 0 });
        communes = rows.length;
      }
    } catch (e: any) {
      await ctx.runMutation(internal.dispatch.log, { carrier, kind: "sync", ok: false, message: e.message });
      throw new ConvexError({ code: "carrier", message: e.message });
    }
    await ctx.runMutation(internal.dispatch.log, { carrier, kind: "sync", ok: true, message: `${desks} stop desks, ${communes} communes` });
    return { desks, communes };
  },
});

/* ---------- status sync (cron) ---------- */
export const syncStatuses = internalAction({
  args: {},
  handler: async (ctx) => {
    const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
    for (const code of CARRIERS) {
      const c = getCarrier(code, dbKeys);
      if (!c.configured) continue;
      const batch = await ctx.runQuery(internal.orders.shippedByCarrier, { carrier: code, limit: code === "ecotrack" ? 100 : 40 });
      if (!batch.length) continue;
      try {
        const res = await c.track(batch);
        for (const b of batch) {
          const r = res.get(b.tracking);
          if (r) await ctx.runMutation(internal.orders.applyCarrierState, { id: b.id, state: r.state, raw: r.raw });
        }
        await ctx.runMutation(internal.orders.touchSync, { ids: batch.filter((b) => !res.has(b.tracking)).map((b) => b.id) });
      } catch (e: any) {
        await ctx.runMutation(internal.dispatch.log, { carrier: code, kind: "sync", ok: false, message: e.message ?? String(e) });
      }
    }
  },
});

export const syncNow = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<void> => {
    await ctx.runQuery(internal.auth.assertPerm, { token, perm: "orders.ship" });
    await ctx.runAction(internal.dispatch.syncStatuses, {});
  },
});

/* ---------- label PDF for the /api/label proxy ---------- */
export const labelPdf = internalAction({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }): Promise<ArrayBuffer | null> => {
    const o = await ctx.runQuery(internal.orders.forDispatch, { id });
    if (!o?.carrier || !o.tracking) return null;
    const dbKeys = await ctx.runQuery(internal.carrierKeys.allRaw, {});
    const l = await getCarrier(o.carrier, dbKeys).getLabel(o.tracking, o.carrierParcelId);
    if ("pdf" in l) return l.pdf;
    const r = await fetch(l.url);
    return r.ok ? await r.arrayBuffer() : null;
  },
});
