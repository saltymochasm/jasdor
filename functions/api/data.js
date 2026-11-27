import { json, fail, tableColumns, choose, value, toBrand, toProduct, toOutlet } from "./_lib.js";

export async function onRequestGet({ env }) {
  try {
    if (!env.DB) return fail("Binding D1 bernama DB belum terhubung.", 503);
    const db = env.DB;
    const [brandRows, productRows, outletRows] = await Promise.all([
      db.prepare("SELECT * FROM brands ORDER BY COALESCE(sort_order, 999999), id").all(),
      db.prepare("SELECT * FROM products ORDER BY id DESC").all(),
      db.prepare("SELECT * FROM outlets ORDER BY COALESCE(sort_order, 999999), id").all()
    ]);
    const brands = (brandRows.results || []).map(toBrand).filter(b => Number(b.is_active) !== 0);
    const products = (productRows.results || []).map(toProduct).filter(p => Number(p.active) !== 0);
    const outlets = (outletRows.results || []).map(toOutlet).filter(o => o.name);
    // Attach legacy option/add-on rows when the existing D1 tables use the MVP schema.
    try {
      const [optionRows, addonRows] = await Promise.all([
        db.prepare("SELECT * FROM product_options").all(),
        db.prepare("SELECT * FROM addons").all()
      ]);
      const opts = optionRows.results || [];
      const adds = addonRows.results || [];
      for (const product of products) {
        product.options = opts.filter(x => Number(value(x, ["product_id"])) === Number(product.id))
          .map(x => ({ name: value(x, ["option_name", "name", "value_name"], ""), price: Number(value(x, ["extra_price", "price_delta", "price"], 0)) }));
        product.addons = adds.filter(x => Number(value(x, ["product_id"])) === Number(product.id))
          .map(x => ({ name: value(x, ["addon_name", "name", "item_name"], ""), price: Number(value(x, ["price", "price_delta"], 0)) }));
      }
    } catch (_) { /* Optional tables may not exist in an older D1 database. */ }
    return json({ brands, products, outlets });
  } catch (error) {
    return fail(`Gagal membaca katalog D1: ${error.message}`, 500);
  }
}
