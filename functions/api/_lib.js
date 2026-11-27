const encoder = new TextEncoder();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function tableColumns(db, table) {
  const rows = await db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all();
  return (rows.results || []).map(row => row.name);
}

export function choose(columns, candidates) {
  return candidates.find(name => columns.includes(name)) || null;
}

export function value(row, candidates, fallback = null) {
  for (const key of candidates) if (row[key] !== undefined && row[key] !== null) return row[key];
  return fallback;
}

export async function insertFlexible(db, table, columns, data) {
  const entries = Object.entries(data).filter(([key, val]) => columns.includes(key) && val !== undefined);
  if (!entries.length) throw new Error(`Tidak ada kolom yang cocok untuk tabel ${table}.`);
  const names = entries.map(([key]) => `"${key}"`).join(",");
  const marks = entries.map(() => "?").join(",");
  const stmt = db.prepare(`INSERT INTO "${table}" (${names}) VALUES (${marks})`);
  const result = await stmt.bind(...entries.map(([, val]) => val)).run();
  return result.meta?.last_row_id ?? null;
}

export async function signedToken(env, payload) {
  const secret = env.ADMIN_PASSWORD;
  if (!secret) throw new Error("Secret ADMIN_PASSWORD belum dipasang di Cloudflare Pages.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${body}.${sig}`;
}

export async function verifyToken(env, token) {
  if (!env.ADMIN_PASSWORD || !token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.ADMIN_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const raw = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sig.length + 3) % 4)), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, raw, encoder.encode(body));
  if (!valid) return false;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(body))));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

export async function requireAdmin(request, env) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return verifyToken(env, token);
}

export function toBrand(row) {
  return {
    id: value(row, ["id"]),
    name: value(row, ["name", "brand_name"], ""),
    slug: value(row, ["slug", "brand_slug"], ""),
    logo: value(row, ["logo_url", "logo"], ""),
    color: value(row, ["color", "accent_color"], ""),
    whatsapp: value(row, ["whatsapp", "whatsapp_number"], ""),
    description: value(row, ["description"], ""),
    is_active: value(row, ["is_active", "active"], 1)
  };
}

export function toProduct(row) {
  return {
    id: value(row, ["id"]),
    brand_id: value(row, ["brand_id"]),
    name: value(row, ["name", "product_name"], ""),
    category: value(row, ["category", "category_name"], ""),
    price: Number(value(row, ["price", "base_price"], 0)),
    compare_price: value(row, ["compare_price", "harga_coret"], null),
    image: value(row, ["image_url", "image", "image_file"], ""),
    description: value(row, ["description"], ""),
    active: value(row, ["is_active", "is_available", "active"], 1),
    options: [],
    addons: []
  };
}

export function toOutlet(row) {
  return {
    id: value(row, ["id"]),
    brand_id: value(row, ["brand_id"]),
    name: value(row, ["outlet_name", "name"], ""),
    address: value(row, ["address"], ""),
    hours: value(row, ["opening_hours", "hours"], "")
  };
}
