
import { json, fail, requireAdmin } from "./_lib.js";

const toIds = value => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(id =>
    Number.isInteger(id) && id > 0
  ))];
};

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return fail("Database belum terhubung.", 503);
    if (!(await requireAdmin(request, env))) {
      return fail("Sesi admin tidak valid.", 401);
    }

    const [options, addons] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM product_option_groups ORDER BY product_id, display_order, id"
      ).all(),
      env.DB.prepare(
        "SELECT * FROM product_addon_groups ORDER BY product_id, display_order, id"
      ).all()
    ]);

    return json({
      product_option_groups: options.results || [],
      product_addon_groups: addons.results || []
    });
  } catch (error) {
    return fail(`Gagal membaca hubungan produk: ${error.message}`, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return fail("Database belum terhubung.", 503);
    if (!(await requireAdmin(request, env))) {
      return fail("Sesi admin tidak valid.", 401);
    }

    const body = await request.json();
    const productId = Number(body.product_id);

    if (!Number.isInteger(productId) || productId < 1) {
      return fail("Produk tidak valid.");
    }

    const product = await env.DB.prepare(
      "SELECT id, brand_id FROM products WHERE id = ?"
    ).bind(productId).first();

    if (!product) return fail("Produk tidak ditemukan.", 404);

    const optionIds = toIds(body.option_group_ids);
    const addonIds = toIds(body.addon_group_ids);

    const statements = [];

    for (const id of optionIds) {
      const group = await env.DB.prepare(
        "SELECT id, brand_id FROM option_groups WHERE id = ? AND is_active = 1"
      ).bind(id).first();

      if (!group || Number(group.brand_id) !== Number(product.brand_id)) {
        return fail("Grup Options harus berasal dari brand produk yang sama.");
      }
    }

    for (const id of addonIds) {
      const group = await env.DB.prepare(
        "SELECT id, brand_id FROM addon_groups WHERE id = ? AND is_active = 1"
      ).bind(id).first();

      if (!group || Number(group.brand_id) !== Number(product.brand_id)) {
        return fail("Grup Add-ons harus berasal dari brand produk yang sama.");
      }
    }

    statements.push(
      env.DB.prepare(
        "DELETE FROM product_option_groups WHERE product_id = ?"
      ).bind(productId)
    );

    statements.push(
      env.DB.prepare(
        "DELETE FROM product_addon_groups WHERE product_id = ?"
      ).bind(productId)
    );

    for (let i = 0; i < optionIds.length; i++) {
      const group = await env.DB.prepare(
        "SELECT is_required, min_select, max_select, display_order FROM option_groups WHERE id = ?"
      ).bind(optionIds[i]).first();

      statements.push(
        env.DB.prepare(`
          INSERT INTO product_option_groups
          (product_id, option_group_id, is_required, min_select, max_select, display_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          productId,
          optionIds[i],
          Number(group.is_required || 0),
          Number(group.min_select || 0),
          group.max_select == null ? null : Number(group.max_select),
          i
        )
      );
    }

    for (let i = 0; i < addonIds.length; i++) {
      const group = await env.DB.prepare(
        "SELECT min_select, max_select FROM addon_groups WHERE id = ?"
      ).bind(addonIds[i]).first();

      statements.push(
        env.DB.prepare(`
          INSERT INTO product_addon_groups
          (product_id, addon_group_id, min_select, max_select, display_order)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          productId,
          addonIds[i],
          Number(group.min_select || 0),
          group.max_select == null ? null : Number(group.max_select),
          i
        )
      );
    }

    await env.DB.batch(statements);

    return json({
      ok: true,
      product_id: productId,
      option_groups_saved: optionIds.length,
      addon_groups_saved: addonIds.length
    });
  } catch (error) {
    return fail(`Gagal menghubungkan grup: ${error.message}`, 500);
  }
}
