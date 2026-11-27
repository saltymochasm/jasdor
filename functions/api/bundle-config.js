
import { json, fail, requireAdmin } from "./_lib.js";

const clean = value => String(value ?? "").trim();
const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const nullableNum = value =>
  value === "" || value == null ? null : num(value);

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return fail("Database belum terhubung.", 503);
    if (!(await requireAdmin(request, env))) {
      return fail("Sesi admin tidak valid.", 401);
    }

    const [bundles, products, rules] = await Promise.all([
      env.DB.prepare(`
        SELECT * FROM bundle_promotions
        ORDER BY brand_id, sort_order, id
      `).all(),

      env.DB.prepare(`
        SELECT * FROM bundle_products
        ORDER BY bundle_id, sort_order, id
      `).all(),

      env.DB.prepare(`
        SELECT * FROM bundle_charge_rules
        ORDER BY bundle_id, id
      `).all()
    ]);

    return json({
      bundle_promotions: bundles.results || [],
      bundle_products: products.results || [],
      bundle_charge_rules: rules.results || []
    });
  } catch (error) {
    return fail(`Gagal membaca Bundling: ${error.message}`, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return fail("Database belum terhubung.", 503);
    if (!(await requireAdmin(request, env))) {
      return fail("Sesi admin tidak valid.", 401);
    }

    const body = await request.json();
    const action = clean(body.action);
    const db = env.DB;

    if (action === "save_bundle") {
      const name = clean(body.bundle_name);
      const brandId = num(body.brand_id, -1);
      const minProducts = num(body.min_products, 1);
      const maxProducts = num(body.max_products, 2);

      if (!name || brandId < 1) {
        return fail("Brand dan nama Bundling wajib diisi.");
      }
      if (minProducts < 1 || maxProducts < minProducts) {
        return fail("Jumlah minimum dan maksimum produk tidak valid.");
      }

      const values = [
        brandId,
        name,
        clean(body.description),
        num(body.bundle_price),
        minProducts,
        maxProducts,
        num(body.allow_mix),
        clean(body.selection_mode || "FIXED"),
        clean(body.start_date) || null,
        clean(body.end_date) || null,
        num(body.is_active, 1),
        num(body.sort_order)
      ];

      if (body.id) {
        await db.prepare(`
          UPDATE bundle_promotions
          SET brand_id=?, bundle_name=?, description=?, bundle_price=?,
              min_products=?, max_products=?, allow_mix=?, selection_mode=?,
              start_date=?, end_date=?, is_active=?, sort_order=?,
              updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).bind(...values, num(body.id)).run();

        return json({ ok: true, id: num(body.id) });
      }

      const result = await db.prepare(`
        INSERT INTO bundle_promotions
        (brand_id, bundle_name, description, bundle_price,
         min_products, max_products, allow_mix, selection_mode,
         start_date, end_date, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(...values).run();

      return json({ ok: true, id: result.meta?.last_row_id ?? null });
    }

    if (action === "delete_bundle") {
      const id = num(body.id);
      if (id < 1) return fail("ID Bundling tidak valid.");

      await db.batch([
        db.prepare("DELETE FROM bundle_charge_rules WHERE bundle_id=?").bind(id),
        db.prepare("DELETE FROM bundle_products WHERE bundle_id=?").bind(id),
        db.prepare("DELETE FROM bundle_promotions WHERE id=?").bind(id)
      ]);

      return json({ ok: true });
    }

    if (action === "save_product") {
      const bundleId = num(body.bundle_id);
      const productId = num(body.product_id);

      if (bundleId < 1 || productId < 1) {
        return fail("Bundling dan produk wajib dipilih.");
      }

      const bundle = await db.prepare(`
        SELECT id, brand_id FROM bundle_promotions WHERE id=?
      `).bind(bundleId).first();

      const product = await db.prepare(`
        SELECT id, brand_id FROM products WHERE id=?
      `).bind(productId).first();

      if (!bundle || !product) {
        return fail("Bundling atau produk tidak ditemukan.", 404);
      }
      if (Number(bundle.brand_id) !== Number(product.brand_id)) {
        return fail("Produk harus berasal dari brand yang sama dengan Bundling.");
      }

      const values = [
        bundleId,
        productId,
        num(body.is_allowed, 1),
        nullableNum(body.max_quantity_per_bundle),
        num(body.sort_order),
        clean(body.notes)
      ];

      if (body.id) {
        await db.prepare(`
          UPDATE bundle_products
          SET bundle_id=?, product_id=?, is_allowed=?,
              max_quantity_per_bundle=?, sort_order=?, notes=?
          WHERE id=?
        `).bind(...values, num(body.id)).run();
      } else {
        await db.prepare(`
          INSERT INTO bundle_products
          (bundle_id, product_id, is_allowed,
           max_quantity_per_bundle, sort_order, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(...values).run();
      }

      return json({ ok: true });
    }

    if (action === "delete_product") {
      await db.prepare(`
        DELETE FROM bundle_products WHERE id=?
      `).bind(num(body.id)).run();

      return json({ ok: true });
    }

    if (action === "save_rule") {
      const bundleId = num(body.bundle_id);
      const chargeScope = clean(body.charge_scope).toUpperCase();
      const scopeType = clean(body.scope_type || "ALL").toUpperCase();
      const pricingPolicy = clean(body.pricing_policy || "STANDARD").toUpperCase();

      if (bundleId < 1) return fail("Bundling wajib dipilih.");
      if (!["OPTIONS", "ADDONS"].includes(chargeScope)) {
        return fail("Jenis biaya harus OPTIONS atau ADDONS.");
      }
      if (!["ALL", "GROUP", "VALUE", "ITEM"].includes(scopeType)) {
        return fail("Jenis cakupan aturan tidak valid.");
      }
      if (!["STANDARD", "INCLUDED", "CUSTOM"].includes(pricingPolicy)) {
        return fail("Kebijakan harga tidak valid.");
      }
      if (scopeType !== "ALL" && num(body.scope_id) < 1) {
        return fail("ID grup atau pilihan wajib diisi.");
      }

      const bundle = await db.prepare(`
        SELECT id FROM bundle_promotions WHERE id=?
      `).bind(bundleId).first();

      if (!bundle) return fail("Bundling tidak ditemukan.", 404);

      const values = [
        bundleId,
        chargeScope,
        scopeType,
        scopeType === "ALL" ? null : num(body.scope_id),
        pricingPolicy,
        num(body.custom_price_delta),
        clean(body.notes)
      ];

      if (body.id) {
        await db.prepare(`
          UPDATE bundle_charge_rules
          SET bundle_id=?, charge_scope=?, scope_type=?, scope_id=?,
              pricing_policy=?, custom_price_delta=?, notes=?
          WHERE id=?
        `).bind(...values, num(body.id)).run();
      } else {
        await db.prepare(`
          INSERT INTO bundle_charge_rules
          (bundle_id, charge_scope, scope_type, scope_id,
           pricing_policy, custom_price_delta, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(...values).run();
      }

      return json({ ok: true });
    }

    if (action === "delete_rule") {
      await db.prepare(`
        DELETE FROM bundle_charge_rules WHERE id=?
      `).bind(num(body.id)).run();

      return json({ ok: true });
    }

    return fail("Aksi Bundling tidak dikenal.", 404);
  } catch (error) {
    return fail(`Operasi Bundling gagal: ${error.message}`, 500);
  }
}
