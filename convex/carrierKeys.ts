/**
 * Carrier API key management — lets the admin set delivery API keys from the panel
 * instead of requiring access to Convex Environment Variables.
 *
 * Keys stored here are loaded into process.env by `loadCarrierKeys()` before any
 * carrier adapter runs. Env vars still take precedence (so Convex Dashboard keys
 * override DB keys if both exist).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { requireMember } from "./lib/auth";

/** Which env vars each carrier needs. */
export const CARRIER_KEY_FIELDS: Record<string, { label: string; fields: { key: string; label: string; placeholder?: string; optional?: boolean }[] }> = {
  yalidine: {
    label: "Yalidine",
    fields: [
      { key: "YALIDINE_API_ID", label: "API ID" },
      { key: "YALIDINE_API_TOKEN", label: "API Token" },
      { key: "YALIDINE_BASE_URL", label: "Base URL (proxy)", placeholder: "https://api.yalidine.app/v1", optional: true },
      { key: "YALIDINE_PROXY_SECRET", label: "Proxy Secret", optional: true },
    ],
  },
  zr_express: {
    label: "ZR Express",
    fields: [
      { key: "ZR_API_KEY", label: "API Key" },
      { key: "ZR_TENANT_ID", label: "Tenant ID" },
    ],
  },
  noest: {
    label: "NOEST Express",
    fields: [
      { key: "NOEST_API_TOKEN", label: "API Token" },
      { key: "NOEST_USER_GUID", label: "User GUID" },
    ],
  },
  ecotrack: {
    label: "EcoTrack",
    fields: [
      { key: "ECOTRACK_BASE_URL", label: "Base URL", placeholder: "https://world-express.ecotrack.dz" },
      { key: "ECOTRACK_TOKEN", label: "API Token" },
      { key: "ECOTRACK_NAME", label: "Carrier Name", placeholder: "World Express", optional: true },
    ],
  },
  meta: {
    label: "Meta Conversions API",
    fields: [
      { key: "META_ACCESS_TOKEN", label: "Access Token" },
      { key: "META_PIXEL_ID", label: "Pixel ID" },
      { key: "META_TEST_EVENT_CODE", label: "Test Event Code", optional: true },
    ],
  },
};

/** Get all carrier keys (admin only, masks secrets for display). */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireMember(ctx, token, "settings");
    const rows = await ctx.db.query("carrierKeys").collect();
    const result: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      const keys = row.keys as Record<string, string>;
      const masked: Record<string, string> = {};
      for (const [k, val] of Object.entries(keys)) {
        // Show last 4 chars only for security
        masked[k] = val ? (val.length > 8 ? "••••••••" + val.slice(-4) : "••••") : "";
      }
      result[row.carrier] = masked;
    }
    return result;
  },
});

/** Get raw keys for a specific carrier (used to check if configured). */
export const getRaw = internalQuery({
  args: { carrier: v.string() },
  handler: async (ctx, { carrier }) => {
    const row = await ctx.db.query("carrierKeys").withIndex("by_carrier", (q) => q.eq("carrier", carrier)).first();
    return row?.keys as Record<string, string> | null;
  },
});

/** Get all raw keys (internal: used by loadCarrierKeys). */
export const allRaw = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("carrierKeys").collect();
    const result: Record<string, Record<string, string>> = {};
    for (const row of rows) result[row.carrier] = row.keys as Record<string, string>;
    return result;
  },
});

/** Save carrier API keys. */
export const save = mutation({
  args: { token: v.string(), carrier: v.string(), keys: v.any() },
  handler: async (ctx, { token, carrier, keys }) => {
    await requireMember(ctx, token, "settings");
    if (!CARRIER_KEY_FIELDS[carrier]) throw new ConvexError({ code: "invalid", message: "Unknown carrier: " + carrier });

    // Validate: only accept known field keys
    const validKeys = CARRIER_KEY_FIELDS[carrier].fields.map((f) => f.key);
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys as Record<string, string>)) {
      if (validKeys.includes(k) && typeof v === "string") cleaned[k] = v.trim();
    }

    const existing = await ctx.db.query("carrierKeys").withIndex("by_carrier", (q) => q.eq("carrier", carrier)).first();
    if (existing) {
      // Merge: keep old values where new value is masked or empty
      const old = existing.keys as Record<string, string>;
      for (const k of validKeys) {
        if (!cleaned[k] || cleaned[k].startsWith("••••")) cleaned[k] = old[k] || "";
      }
      await ctx.db.patch(existing._id, { keys: cleaned, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("carrierKeys", { carrier, keys: cleaned, updatedAt: Date.now() });
    }
  },
});

/** Delete all keys for a carrier. */
export const remove = mutation({
  args: { token: v.string(), carrier: v.string() },
  handler: async (ctx, { token, carrier }) => {
    await requireMember(ctx, token, "settings");
    const existing = await ctx.db.query("carrierKeys").withIndex("by_carrier", (q) => q.eq("carrier", carrier)).first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
