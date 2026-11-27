
import {
  json,
  fail,
  value,
  toBrand,
  toProduct,
  toOutlet
} from "./_lib.js";

export async function onRequestGet({ env }) {
  try {
    if (!env.DB) {
      return fail("Binding D1 bernama DB belum terhubung.", 503);
    }

    const db = env.DB;

    const [
      brandRows,
      productRows,
      outletRows,
      optionRows,
      addonRows,
      legacyOptionRows,
      legacyAddonRows
    ] = await Promise.all([
      db.prepare(
        "SELECT * FROM brands ORDER BY COALESCE(sort_order, 999999), id"
      ).all(),

      db.prepare(
        "SELECT * FROM products ORDER BY id DESC"
      ).all(),

      db.prepare(
        "SELECT * FROM outlets ORDER BY COALESCE(sort_order, 999999), id"
      ).all(),

      db.prepare(`
        SELECT
          pog.product_id,
          pog.is_required,
          pog.min_select,
          pog.max_select,
          pog.display_order,
          og.id AS group_id,
          og.group_name,
          og.selection_type,
          og.description,
          ov.id AS value_id,
          ov.value_name,
          ov.price_delta,
          ov.sort_order AS value_sort_order
        FROM product_option_groups pog
        JOIN option_groups og
          ON og.id = pog.option_group_id
        LEFT JOIN option_values ov
          ON ov.option_group_id = og.id
          AND ov.is_available = 1
        WHERE og.is_active = 1
        ORDER BY
          pog.product_id,
          pog.display_order,
          og.id,
          ov.sort_order,
          ov.id
      `).all(),

      db.prepare(`
        SELECT
          pag.product_id,
          pag.min_select,
          pag.max_select,
          pag.display_order,
          ag.id AS group_id,
          ag.group_name,
          ag.selection_type,
          ag.description,
          ai.id AS item_id,
          ai.item_name,
          ai.price_delta,
          ai.sort_order AS item_sort_order
        FROM product_addon_groups pag
        JOIN addon_groups ag
          ON ag.id = pag.addon_group_id
        LEFT JOIN addon_items ai
          ON ai.addon_group_id = ag.id
          AND ai.is_available = 1
        WHERE ag.is_active = 1
        ORDER BY
          pag.product_id,
          pag.display_order,
          ag.id,
          ai.sort_order,
          ai.id
      `).all(),

      db.prepare(
        "SELECT * FROM product_options"
      ).all(),

      db.prepare(
        "SELECT * FROM addons"
      ).all()
    ]);

    const brands = (brandRows.results || [])
      .map(toBrand)
      .filter(b => Number(b.is_active) !== 0);

    const products = (productRows.results || [])
      .map(toProduct)
      .filter(p => Number(p.active) !== 0);

    const outlets = (outletRows.results || [])
      .map(toOutlet)
      .filter(o => o.name);

    // =====================================
    // KONFIGURASI OPTIONS PER PRODUK
    // =====================================

    const optionMap = new Map();

    for (const row of optionRows.results || []) {
      const productId = Number(row.product_id);
      const groupId = Number(row.group_id);

      if (!optionMap.has(productId)) {
        optionMap.set(productId, new Map());
      }

      const productGroups = optionMap.get(productId);

      if (!productGroups.has(groupId)) {
        productGroups.set(groupId, {
          id: groupId,
          group_name: row.group_name,
          selection_type: row.selection_type,
          description: row.description || "",
          is_required: Number(row.is_required || 0),
          min_select: Number(row.min_select || 0),
          max_select: row.max_select == null
            ? null
            : Number(row.max_select),
          display_order: Number(row.display_order || 0),
          values: []
        });
      }

      const group = productGroups.get(groupId);

      if (row.value_id != null) {
        group.values.push({
          id: Number(row.value_id),
          value_name: row.value_name,
          price_delta: Number(row.price_delta || 0),
          sort_order: Number(row.value_sort_order || 0)
        });
      }
    }

    // =====================================
    // KONFIGURASI ADD-ONS PER PRODUK
    // =====================================

    const addonMap = new Map();

    for (const row of addonRows.results || []) {
      const productId = Number(row.product_id);
      const groupId = Number(row.group_id);

      if (!addonMap.has(productId)) {
        addonMap.set(productId, new Map());
      }

      const productGroups = addonMap.get(productId);

      if (!productGroups.has(groupId)) {
        productGroups.set(groupId, {
          id: groupId,
          group_name: row.group_name,
          selection_type: row.selection_type,
          description: row.description || "",
          min_select: Number(row.min_select || 0),
          max_select: row.max_select == null
            ? null
            : Number(row.max_select),
          display_order: Number(row.display_order || 0),
          items: []
        });
      }

      const group = productGroups.get(groupId);

      if (row.item_id != null) {
        group.items.push({
          id: Number(row.item_id),
          item_name: row.item_name,
          price_delta: Number(row.price_delta || 0),
          sort_order: Number(row.item_sort_order || 0)
        });
      }
    }

    // =====================================
    // PASANG KONFIGURASI KE SETIAP PRODUK
    // =====================================

    for (const product of products) {
      const optionGroups = optionMap.get(Number(product.id));
      const addonGroups = addonMap.get(Number(product.id));

      product.config_options = optionGroups
        ? [...optionGroups.values()]
        : [];

      product.config_addons = addonGroups
        ? [...addonGroups.values()]
        : [];
    }

    // =====================================
    // OPSI DAN ADD-ONS LAMA
    // Tetap dipertahankan untuk kompatibilitas
    // =====================================

    const oldOptions = legacyOptionRows.results || [];
    const oldAddons = legacyAddonRows.results || [];

    for (const product of products) {
      product.options = oldOptions
        .filter(x =>
          Number(value(x, ["product_id"])) === Number(product.id)
        )
        .map(x => ({
          name: value(
            x,
            ["option_name", "name", "value_name"],
            ""
          ),
          price: Number(
            value(x, ["extra_price", "price_delta", "price"], 0)
          )
        }));

      product.addons = oldAddons
        .filter(x =>
          Number(value(x, ["product_id"])) === Number(product.id)
        )
        .map(x => ({
          name: value(
            x,
            ["addon_name", "name", "item_name"],
            ""
          ),
          price: Number(
            value(x, ["price", "price_delta"], 0)
          )
        }));
    }

    return json({
      brands,
      products,
      outlets
    });

  } catch (error) {
    return fail(
      `Gagal membaca katalog D1: ${error.message}`,
      500
    );
  }
}
