import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMember } from "./lib/auth";
import { getSettings } from "./settings";
import { publicRates } from "./shipping";
import { i18n, i18nList } from "./schema";

async function imageUrls(ctx: QueryCtx, ids: Id<"_storage">[]) {
  const out: string[] = [];
  for (const id of ids) {
    const u = await ctx.storage.getUrl(id);
    if (u) out.push(u);
  }
  return out;
}

async function productView(ctx: QueryCtx, p: Doc<"products">, cats: Doc<"categories">[]) {
  const cat = cats.find((c) => c._id === p.categoryId);
  return {
    id: p._id, slug: p.slug, name: p.name, size: p.size ?? null, desc: p.desc ?? null, benefits: p.benefits ?? null, usage: p.usage ?? null,
    price: p.price, compareAt: p.compareAt ?? null, cat: cat?.slug ?? null, images: await imageUrls(ctx, p.images),
    shape: p.shape ?? "dropper", tint: p.tint ?? "rose", inStock: !p.trackStock || p.stock > 0,
  };
}

/** Everything the storefront needs, in one public read. */
export async function storefrontData(ctx: QueryCtx) {
  const s = await getSettings(ctx);
  const cats = (await ctx.db.query("categories").collect()).sort((a, b) => a.sortOrder - b.sortOrder);
  const prods = await ctx.db.query("products").withIndex("by_active", (q) => q.eq("active", true)).collect();
  return {
    store: {
      name: s.name, tagline: s.tagline, phone: s.phone, whatsapp: s.whatsapp, freeShippingFrom: s.freeShippingFrom,
      confirmDelay: s.confirmDelay, deliveryDelay: s.deliveryDelay, zoneFees: s.zoneFees, fbPixelId: s.fbPixelId ?? null,
      tiktokPixelId: s.tiktokPixelId ?? null, defaultCarrier: s.defaultCarrier ?? null,
    },
    categories: cats.map((c) => ({ slug: c.slug, name: c.name, parent: cats.find((p) => p._id === c.parentId)?.slug ?? null })),
    products: await Promise.all(prods.map((p) => productView(ctx, p, cats))),
    rates: await publicRates(ctx),
  };
}

export const storefront = query({ args: {}, handler: (ctx) => storefrontData(ctx) });

/* ---------- Admin: products ---------- */
export const adminProducts = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireMember(ctx, token);
    const cats = await ctx.db.query("categories").collect();
    const ps = (await ctx.db.query("products").collect()).sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      categories: cats.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c._id, slug: c.slug, name: c.name, parentId: c.parentId ?? null, sortOrder: c.sortOrder })),
      products: await Promise.all(
        ps.map(async (p) => ({ ...p, id: p._id, imageUrls: await Promise.all(p.images.map(async (i) => ({ id: i, url: await ctx.storage.getUrl(i) }))) })),
      ),
    };
  },
});

const productFields = {
  slug: v.string(),
  name: i18n,
  size: v.optional(i18n),
  desc: v.optional(i18n),
  benefits: v.optional(i18nList),
  usage: v.optional(i18n),
  price: v.number(),
  compareAt: v.optional(v.number()),
  categoryId: v.optional(v.id("categories")),
  images: v.array(v.id("_storage")),
  shape: v.optional(v.string()),
  tint: v.optional(v.string()),
  active: v.boolean(),
  trackStock: v.boolean(),
  lowAt: v.number(),
  weightKg: v.optional(v.number()),
  sku: v.optional(v.string()),
  sortOrder: v.number(),
};

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "p-" + Date.now().toString(36);
}

export const saveProduct = mutation({
  args: { token: v.string(), id: v.optional(v.id("products")), data: v.object(productFields) },
  handler: async (ctx, { token, id, data }) => {
    await requireMember(ctx, token, "catalog");
    if (data.price < 0 || data.price > 1_000_000) throw new ConvexError({ code: "invalid", message: "Price is out of range" });
    const slug = slugify(data.slug || data.name.fr);
    const clash = await ctx.db.query("products").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (clash && clash._id !== id) throw new ConvexError({ code: "exists", message: "Another product already uses this link name" });
    if (id) {
      const old = await ctx.db.get(id);
      if (!old) throw new ConvexError({ code: "not_found", message: "Product not found" });
      for (const img of old.images) if (!data.images.includes(img)) await ctx.storage.delete(img);
      await ctx.db.patch(id, { ...data, slug });
      return id;
    }
    return ctx.db.insert("products", { ...data, slug, stock: 0 });
  },
});

export const deleteProduct = mutation({
  args: { token: v.string(), id: v.id("products") },
  handler: async (ctx, { token, id }) => {
    await requireMember(ctx, token, "catalog");
    const p = await ctx.db.get(id);
    if (!p) return;
    // Keep history intact: products referenced by orders are archived instead of deleted.
    await ctx.db.patch(id, { active: false });
  },
});

/** Permanently removes a product, its stock-move history, and its stored images. Irreversible. */
export const hardDeleteProduct = mutation({
  args: { token: v.string(), id: v.id("products") },
  handler: async (ctx, { token, id }) => {
    await requireMember(ctx, token, "catalog");
    const p = await ctx.db.get(id);
    if (!p) return;
    // Delete all stock-move history rows that reference this product
    const moves = await ctx.db.query("stockMoves").withIndex("by_product", (q) => q.eq("productId", id)).collect();
    for (const m of moves) await ctx.db.delete(m._id);
    // Delete all images from storage
    for (const img of p.images) {
      try { await ctx.storage.delete(img); } catch { /* ignore if already gone */ }
    }
    await ctx.db.delete(id);
  },
});

/** Owner-only: wipe every product and category (use to clear demo/seed data before going live). */
export const wipeAllProducts = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const member = await requireMember(ctx, token);
    if (member.role !== "owner" && member.role !== "manager") {
      throw new ConvexError({ code: "forbidden", message: "Owner or manager access required" });
    }
    const products = await ctx.db.query("products").collect();
    for (const p of products) {
      // Delete stock-move history first
      const moves = await ctx.db.query("stockMoves").withIndex("by_product", (q) => q.eq("productId", p._id)).collect();
      for (const m of moves) await ctx.db.delete(m._id);
      for (const img of p.images) {
        try { await ctx.storage.delete(img); } catch { /* ignore */ }
      }
      await ctx.db.delete(p._id);
    }
    const categories = await ctx.db.query("categories").collect();
    for (const c of categories) {
      await ctx.db.delete(c._id);
    }
    return { deleted: products.length, categories: categories.length };
  },
});

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireMember(ctx, token, "catalog");
    return ctx.storage.generateUploadUrl();
  },
});

/* ---------- Admin: categories ---------- */
export const saveCategory = mutation({
  args: { token: v.string(), id: v.optional(v.id("categories")), slug: v.string(), name: i18n, parentId: v.optional(v.id("categories")), sortOrder: v.number() },
  handler: async (ctx, { token, id, ...data }) => {
    await requireMember(ctx, token, "catalog");
    const slug = slugify(data.slug || data.name.fr);
    if (id) { await ctx.db.patch(id, { ...data, slug }); return id; }
    return ctx.db.insert("categories", { ...data, slug });
  },
});

export const deleteCategory = mutation({
  args: { token: v.string(), id: v.id("categories") },
  handler: async (ctx, { token, id }) => {
    await requireMember(ctx, token, "catalog");
    const used = await ctx.db.query("products").filter((q) => q.eq(q.field("categoryId"), id)).first();
    if (used) throw new ConvexError({ code: "in_use", message: "Move the products out of this category first" });
    const child = await ctx.db.query("categories").filter((q) => q.eq(q.field("parentId"), id)).first();
    if (child) throw new ConvexError({ code: "in_use", message: "Delete its subcategories first" });
    await ctx.db.delete(id);
  },
});
