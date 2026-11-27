
import { json, fail, requireAdmin } from "./_lib.js";

const tables = {
  option: {
    groups: "option_groups",
    items: "option_values",
    foreign: "option_group_id"
  },
  addon: {
    groups: "addon_groups",
    items: "addon_items",
    foreign: "addon_group_id"
  }
};

const clean = value => String(value ?? "").trim();
const number = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return fail("Database belum terhubung.", 503);
    if (!(await requireAdmin(request, env))) {
      return fail("Sesi admin tidak valid.", 401);
    }

    const db = env.DB;

    const [og, ov, ag, ai] = await Promise.all([
      db.prepare("SELECT * FROM option_groups ORDER BY brand_id, display_order, id").all(),
      db.prepare("SELECT * FROM option_values ORDER BY sort_order, id").all(),
      db.prepare("SELECT * FROM addon_groups ORDER BY brand_id, display_order, id").all(),
      db.prepare("SELECT * FROM addon_items ORDER BY sort_order, id").all()
    ]);

    return json({
      option_groups: og.results || [],
      option_values: ov.results || [],
      addon_groups: ag.results || [],
      addon_items: ai.results || []
    });
  } catch (error) {
    return fail(`Gagal membaca konfigurasi: ${error.message}`, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return fail("Database belum terhubung.", 503);
    if (!(await requireAdmin(request, env))) {
      return fail("Sesi admin tidak valid.", 401);
    }

    const db = env.DB;
    const body = await request.json();
    const type = body.type;
    const action = body.action;
    const config = tables[type];

    if (!config) return fail("Jenis konfigurasi tidak dikenal.");

    if (action === "save_group") {
      const name = clean(body.group_name);
      const brandId = number(body.brand_id, -1);

      if (!name || brandId < 1) {
        return fail("Nama grup dan brand wajib diisi.");
      }

      if (type === "option") {
        const values = [
          brandId, name,
          clean(body.selection_type || "SINGLE"),
          number(body.is_required),
          number(body.min_select),
          body.max_select === "" || body.max_select == null
            ? null : number(body.max_select),
          number(body.display_order),
          clean(body.description),
          number(body.is_active, 1)
        ];

        if (body.id) {
          await db.prepare(`
            UPDATE option_groups
            SET brand_id=?, group_name=?, selection_type=?,
                is_required=?, min_select=?, max_select=?,
                display_order=?, description=?, is_active=?
            WHERE id=?
          `).bind(...values, number(body.id)).run();
        } else {
          await db.prepare(`
            INSERT INTO option_groups
            (brand_id, group_name, selection_type, is_required,
             min_select, max_select, display_order, description, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(...values).run();
        }
      } else {
        const values = [
          brandId, name,
          number(body.min_select),
          body.max_select === "" || body.max_select == null
            ? null : number(body.max_select),
          clean(body.selection_type || "MULTIPLE"),
          number(body.display_order),
          number(body.is_active, 1),
          clean(body.description)
        ];

        if (body.id) {
          await db.prepare(`
            UPDATE addon_groups
            SET brand_id=?, group_name=?, min_select=?, max_select=?,
                selection_type=?, display_order=?, is_active=?, description=?
            WHERE id=?
          `).bind(...values, number(body.id)).run();
        } else {
          await db.prepare(`
            INSERT INTO addon_groups
            (brand_id, group_name, min_select, max_select,
             selection_type, display_order, is_active, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(...values).run();
        }
      }

      return json({ ok: true });
    }

    if (action === "save_item") {
      const groupId = number(body.group_id, -1);
      const name = clean(body.item_name);

      if (groupId < 1 || !name) {
        return fail("Grup dan nama pilihan wajib diisi.");
      }

      const table = config.items;
      const foreign = config.foreign;

      if (type === "option") {
        const values = [
          groupId, name, number(body.price_delta),
          number(body.is_available, 1), number(body.sort_order)
        ];

        if (body.id) {
          await db.prepare(`
            UPDATE option_values
            SET option_group_id=?, value_name=?, price_delta=?,
                is_available=?, sort_order=?
            WHERE id=?
          `).bind(...values, number(body.id)).run();
        } else {
          await db.prepare(`
            INSERT INTO option_values
            (option_group_id, value_name, price_delta, is_available, sort_order)
            VALUES (?, ?, ?, ?, ?)
          `).bind(...values).run();
        }
      } else {
        const values = [
          groupId, name, number(body.price_delta),
          clean(body.image_file), number(body.is_available, 1),
          number(body.sort_order)
        ];

        if (body.id) {
          await db.prepare(`
            UPDATE addon_items
            SET addon_group_id=?, item_name=?, price_delta=?,
                image_file=?, is_available=?, sort_order=?
            WHERE id=?
          `).bind(...values, number(body.id)).run();
        } else {
          await db.prepare(`
            INSERT INTO addon_items
            (addon_group_id, item_name, price_delta, image_file,
             is_available, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(...values).run();
        }
      }

      return json({ ok: true });
    }

    if (action === "delete_item") {
      await db.prepare(
        `DELETE FROM "${config.items}" WHERE id=?`
      ).bind(number(body.id)).run();

      return json({ ok: true });
    }

    if (action === "delete_group") {
      const groupId = number(body.id);

      const linked = type === "option"
        ? await db.prepare(
            "SELECT COUNT(*) AS total FROM product_option_groups WHERE option_group_id=?"
          ).bind(groupId).first()
        : await db.prepare(
            "SELECT COUNT(*) AS total FROM product_addon_groups WHERE addon_group_id=?"
          ).bind(groupId).first();

      if (Number(linked?.total || 0) > 0) {
        return fail("Grup masih terhubung ke produk. Lepaskan hubungan produk terlebih dahulu.");
      }

      await db.prepare(
        `DELETE FROM "${config.items}" WHERE "${config.foreign}"=?`
      ).bind(groupId).run();

      await db.prepare(
        `DELETE FROM "${config.groups}" WHERE id=?`
      ).bind(groupId).run();

      return json({ ok: true });
    }

    return fail("Aksi tidak dikenal.", 404);
  } catch (error) {
    return fail(`Operasi gagal: ${error.message}`, 500);
  }
}
