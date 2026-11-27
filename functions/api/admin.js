import { json, fail, tableColumns, choose, insertFlexible, requireAdmin, signedToken } from "./_lib.js";

const asInt = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clean = v => String(v ?? "").trim();

async function addBrand(db, body) {
  const cols = await tableColumns(db, "brands");
  const data = {};
  const map = {
    name: ["name", "brand_name"], slug: ["slug", "brand_slug"],
    logo: ["logo_url", "logo"], color: ["color", "accent_color"],
    whatsapp: ["whatsapp", "whatsapp_number"], description: ["description"],
    is_active: ["is_active", "active"], sort_order: ["sort_order"]
  };
  for (const [input, candidates] of Object.entries(map)) {
    const col = choose(cols, candidates);
    if (col && body[input] !== undefined) data[col] = input === "is_active" ? asInt(body[input], 1) : body[input];
  }
  if (!data[choose(cols, map.name)]) throw new Error("Kolom nama brand tidak ditemukan.");
  if (choose(cols, map.is_active) && data[choose(cols, map.is_active)] === undefined) data[choose(cols, map.is_active)] = 1;
  await insertFlexible(db, "brands", cols, data);
}

async function addProduct(db, body) {
  const cols = await tableColumns(db, "products");
  const data = {};
  const fields = {
    brand_id: ["brand_id"], name: ["name", "product_name"], category: ["category", "category_name"],
    description: ["description"], price: ["price", "base_price"],
    compare_price: ["compare_price", "harga_coret"], image: ["image_url", "image", "image_file"],
    active: ["is_active", "is_available", "active"], sort_order: ["sort_order"]
  };
  for (const [input, candidates] of Object.entries(fields)) {
    const col = choose(cols, candidates);
    if (col && body[input] !== undefined && body[input] !== "") {
      data[col] = ["brand_id", "price", "compare_price", "active", "sort_order"].includes(input)
        ? (body[input] === null ? null : asInt(body[input])) : body[input];
    }
  }
  const id = await insertFlexible(db, "products", cols, data);
  if (id) {
    await addChildRows(db, "product_options", id, body.options || [], "option");
    await addChildRows(db, "addons", id, body.addons || [], "addon");
  }
}

async function addChildRows(db, table, productId, items, kind) {
  if (!Array.isArray(items) || !items.length) return;
  const cols = await tableColumns(db, table);
  for (const item of items) {
    const data = {};
    const productCol = choose(cols, ["product_id"]);
    const nameCol = kind === "option" ? choose(cols, ["option_name", "name", "value_name"]) : choose(cols, ["addon_name", "name", "item_name"]);
    const priceCol = kind === "option" ? choose(cols, ["extra_price", "price_delta", "price"]) : choose(cols, ["price", "price_delta"]);
    if (productCol) data[productCol] = productId;
    if (nameCol) data[nameCol] = clean(item.name);
    if (priceCol) data[priceCol] = asInt(item.price);
    if (Object.keys(data).length >= 2) await insertFlexible(db, table, cols, data);
  }
}

async function addOutlet(db, body) {
  const cols = await tableColumns(db, "outlets");
  const data = {};
  const map = {
    brand_id: ["brand_id"], name: ["outlet_name", "name"],
    address: ["address"], hours: ["opening_hours", "hours"],
    is_active: ["is_active"], is_verified: ["is_verified"], sort_order: ["sort_order"]
  };
  for (const [input, candidates] of Object.entries(map)) {
    const col = choose(cols, candidates);
    if (col && body[input] !== undefined && body[input] !== "") data[col] = input === "brand_id" ? asInt(body[input]) : body[input];
  }
  const nameCol = choose(cols, map.name);
  if (!nameCol || !data[nameCol]) throw new Error("Kolom nama outlet tidak ditemukan.");
  if (choose(cols, map.is_active) && data[choose(cols, map.is_active)] === undefined) data[choose(cols, map.is_active)] = 1;
  await insertFlexible(db, "outlets", cols, data);
}

async function removeRecord(db, type, id) {
  const tables = { brand: "brands", product: "products", outlet: "outlets" };
  const table = tables[type];
  if (!table) throw new Error("Jenis data tidak dikenal.");
  await db.prepare(`DELETE FROM "${table}" WHERE id = ?`).bind(asInt(id)).run();
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return fail("Binding D1 bernama DB belum terhubung.", 503);
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const body = await request.json().catch(() => ({}));

    if (action === "login") {
      if (!env.ADMIN_PASSWORD) return fail("Secret ADMIN_PASSWORD belum dipasang di Cloudflare Pages.", 503);
      if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD) return fail("Password admin salah.", 401);
      const token = await signedToken(env, { role: "admin", exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 });
      return json({ token });
    }

    if (!(await requireAdmin(request, env))) return fail("Sesi admin tidak valid atau sudah berakhir. Silakan masuk kembali.", 401);
    const db = env.DB;

    if (action === "brand") await addBrand(db, body);
    else if (action === "product") await addProduct(db, body);
    else if (action === "outlet") await addOutlet(db, body);
    else if (action === "delete") await removeRecord(db, String(body.type || ""), body.id);
    else return fail("Aksi admin tidak dikenal.", 404);

    return json({ ok: true });
  } catch (error) {
    return fail(`Operasi admin gagal: ${error.message}`, 500);
  }
}
