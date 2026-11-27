
(() => {
  let adminToken = null;
  let brands = [];
  let products = [];
  let bundles = [];
  let chargeRules = [];
  let config = {
    option_groups: [],
    option_values: [],
    addon_groups: [],
    addon_items: []
  };
  let loaded = false;

  const $ = selector => document.querySelector(selector);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const rupiah = value =>
    'Rp' + Number(value || 0).toLocaleString('id-ID');

  const originalFetch = window.fetch.bind(window);

  // Menangkap token login Admin.
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0]?.url || args[0] || '');

    if (url.includes('/api/admin?action=login') && response.ok) {
      try {
        const result = await response.clone().json();
        if (result.token) adminToken = result.token;
      } catch (error) {
        console.error('Gagal membaca sesi Admin:', error);
      }
    }

    return response;
  };

  function notify(message) {
    const toast = $('#toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
      alert(message);
    }
  }

  async function api(url, options = {}) {
    if (!adminToken) {
      throw new Error('Silakan login Admin terlebih dahulu.');
    }

    const response = await originalFetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: 'Bearer ' + adminToken,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Permintaan gagal.');
    }

    return result;
  }

  function addBundleTab() {
    const tabs = $('.admin-tabs');
    const panel = $('#adminPanel');

    if (!tabs || !panel || $('#bundlesAdmin')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Bundling';
    tabs.appendChild(button);

    const section = document.createElement('section');
    section.id = 'bundlesAdmin';
    section.className = 'admin-tab hidden';

    section.innerHTML = `
      <h3>Kelola Bundling</h3>
      <p class="muted">
        Buat paket promo untuk produk dari brand yang sama.
      </p>

      <h4>Buat Bundling baru</h4>

      <form id="bundleForm" class="admin-form">
        <label>Brand</label>
        <select name="brand_id" id="bundleBrand" required>
          <option value="">Pilih brand</option>
        </select>

        <label>Nama Bundling</label>
        <input name="bundle_name"
          placeholder="Contoh: Paket Hemat Berdua" required>

        <label>Deskripsi</label>
        <textarea name="description"
          placeholder="Keterangan paket (opsional)"></textarea>

        <label>Harga paket (Rp)</label>
        <input name="bundle_price" type="number"
          min="0" value="0" required>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label>
            Minimal produk
            <input name="min_products" type="number"
              min="1" value="1" required>
          </label>
          <label>
            Maksimal produk
            <input name="max_products" type="number"
              min="1" value="2" required>
          </label>
        </div>

        <label class="inline">
          <input name="allow_mix" type="checkbox">
          Boleh mencampur produk berbeda
        </label>

        <label>Mode pemilihan</label>
        <select name="selection_mode">
          <option value="FIXED">Paket tetap</option>
          <option value="CHOICE">Pelanggan bebas memilih</option>
        </select>

        <label>Tanggal mulai promo</label>
        <input name="start_date" type="date">

        <label>Tanggal berakhir promo</label>
        <input name="end_date" type="date">

        <label class="inline">
          <input name="is_active" type="checkbox" checked>
          Bundling aktif
        </label>

        <label>Urutan tampil</label>
        <input name="sort_order" type="number" value="0">

        <hr>

        <h4>Produk yang boleh masuk paket</h4>
        <p class="muted">
          Pilih produk dari brand yang dipilih di atas.
        </p>

        <div id="bundleProductChoices">
          <p class="muted">Pilih brand terlebih dahulu.</p>
        </div>

        <button class="primary full" type="submit">
          Simpan Bundling
        </button>
        <p id="bundleStatus" class="muted"></p>
      </form>

      <hr>

      <h3>Daftar Bundling</h3>
      <div id="bundleList">
        <p class="muted">Memuat data...</p>
      </div>

      <hr>

      <h3>Aturan Biaya Tambahan</h3>
      <p class="muted">
        Atur biaya Options dan Add-ons secara terpisah untuk setiap Bundling.
      </p>

      <form id="ruleForm" class="admin-form">
        <label>Pilih Bundling</label>
        <select name="bundle_id" id="ruleBundle" required>
          <option value="">Pilih Bundling</option>
        </select>

        <label>Jenis biaya</label>
        <select name="charge_scope" id="ruleChargeScope">
          <option value="OPTIONS">Options</option>
          <option value="ADDONS">Add-ons</option>
        </select>

        <label>Cakupan aturan</label>
        <select name="scope_type" id="ruleScopeType">
          <option value="ALL">Semua pilihan</option>
          <option value="GROUP">Grup tertentu</option>
          <option value="VALUE">Nilai Option tertentu</option>
          <option value="ITEM">Item Add-on tertentu</option>
        </select>

        <div id="ruleTargetWrap" class="hidden">
          <label id="ruleTargetLabel">Pilih target</label>
          <select name="scope_id" id="ruleTarget">
            <option value="">Pilih target</option>
          </select>
        </div>

        <label>Kebijakan harga</label>
        <select name="pricing_policy" id="rulePolicy">
          <option value="STANDARD">STANDARD — Harga normal</option>
          <option value="INCLUDED">INCLUDED — Sudah termasuk paket</option>
          <option value="CUSTOM">CUSTOM — Harga khusus paket</option>
        </select>

        <div id="ruleCustomWrap" class="hidden">
          <label>Biaya tambahan khusus (Rp)</label>
          <input name="custom_price_delta"
            type="number" value="0" min="0">
        </div>

        <label>Catatan aturan (opsional)</label>
        <textarea name="notes"
          placeholder="Contoh: Large dikenakan tambahan Rp5.000"></textarea>

        <button class="primary full" type="submit">
          Simpan Aturan Biaya
        </button>

        <p id="ruleStatus" class="muted"></p>
      </form>

      <h4>Aturan yang sudah dibuat</h4>
      <div id="ruleList">
        <p class="muted">Pilih Bundling terlebih dahulu.</p>
      </div>
    `;

    tabs.after(section);

    button.addEventListener('click', async () => {
      tabs.querySelectorAll('button').forEach(item =>
        item.classList.toggle('active', item === button)
      );

      panel.querySelectorAll('.admin-tab').forEach(item =>
        item.classList.toggle('hidden', item !== section)
      );

      if (!loaded) await loadBundleData();
    });

    $('#bundleBrand').addEventListener('change', renderBundleProducts);
    $('#bundleForm').addEventListener('submit', saveBundle);

    $('#ruleBundle').addEventListener('change', renderRuleList);
    $('#ruleChargeScope').addEventListener('change', renderRuleTargets);
    $('#ruleScopeType').addEventListener('change', renderRuleTargets);
    $('#rulePolicy').addEventListener('change', renderRulePolicy);
    $('#ruleForm').addEventListener('submit', saveRule);
  }

  async function loadBundleData() {
    const status = $('#bundleStatus');

    try {
      status.textContent = 'Memuat data Bundling...';

      const [catalog, bundleData, adminConfig] = await Promise.all([
        originalFetch('/api/data').then(r => {
          if (!r.ok) throw new Error('Gagal membaca katalog.');
          return r.json();
        }),
        api('/api/bundle-config'),
        api('/api/admin-config')
      ]);

      brands = catalog.brands || [];
      products = catalog.products || [];
      bundles = bundleData.bundle_promotions || [];
      chargeRules = bundleData.bundle_charge_rules || [];
      config = adminConfig;

      $('#bundleBrand').innerHTML =
        '<option value="">Pilih brand</option>' +
        brands.map(b =>
          `<option value="${b.id}">${esc(b.name)}</option>`
        ).join('');

      renderBundleProducts();
      renderBundleList();
      renderRuleBundleOptions();

      loaded = true;
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
      notify(error.message);
    }
  }

  function renderBundleProducts() {
    const brandId = Number($('#bundleBrand').value);
    const container = $('#bundleProductChoices');

    if (!brandId) {
      container.innerHTML =
        '<p class="muted">Pilih brand terlebih dahulu.</p>';
      return;
    }

    const items = products.filter(p =>
      Number(p.brand_id) === brandId
    );

    container.innerHTML = items.length
      ? items.map(p => `
          <label class="inline" style="
            display:flex;gap:9px;margin:10px 0;align-items:center
          ">
            <input type="checkbox" name="bundle_product" value="${p.id}">
            <span>
              <b>${esc(p.name)}</b><br>
              <small class="muted">${rupiah(p.price)}</small>
            </span>
          </label>
        `).join('')
      : '<p class="muted">Belum ada produk untuk brand ini.</p>';
  }

  async function saveBundle(event) {
    event.preventDefault();

    const form = event.target;
    const values = new FormData(form);
    const status = $('#bundleStatus');

    const brandId = Number(values.get('brand_id'));
    const min = Number(values.get('min_products'));
    const max = Number(values.get('max_products'));

    if (min < 1 || max < min) {
      notify('Jumlah produk minimum dan maksimum tidak valid.');
      return;
    }

    const selectedProducts = [
      ...form.querySelectorAll('[name="bundle_product"]:checked')
    ].map(input => Number(input.value));

    if (selectedProducts.length === 0) {
      notify('Pilih minimal satu produk untuk Bundling.');
      return;
    }

    const payload = {
      action: 'save_bundle',
      brand_id: brandId,
      bundle_name: values.get('bundle_name'),
      description: values.get('description'),
      bundle_price: Number(values.get('bundle_price') || 0),
      min_products: min,
      max_products: max,
      allow_mix: values.has('allow_mix') ? 1 : 0,
      selection_mode: values.get('selection_mode'),
      start_date: values.get('start_date'),
      end_date: values.get('end_date'),
      is_active: values.has('is_active') ? 1 : 0,
      sort_order: Number(values.get('sort_order') || 0)
    };

    try {
      status.textContent = 'Menyimpan Bundling...';

      const saved = await api('/api/bundle-config', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!saved.id) {
        throw new Error('Bundling tersimpan tetapi ID tidak ditemukan.');
      }

      for (const productId of selectedProducts) {
        await api('/api/bundle-config', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_product',
            bundle_id: saved.id,
            product_id: productId,
            is_allowed: 1,
            sort_order: 0
          })
        });
      }

      form.reset();
      form.querySelector('[name="is_active"]').checked = true;
      form.querySelector('[name="min_products"]').value = 1;
      form.querySelector('[name="max_products"]').value = 2;
      form.querySelector('[name="bundle_price"]').value = 0;
      form.querySelector('[name="sort_order"]').value = 0;

      renderBundleProducts();

      status.textContent = 'Bundling berhasil disimpan.';
      notify('Bundling berhasil disimpan.');

      await refreshBundles();
    } catch (error) {
      status.textContent = error.message;
      notify(error.message);
    }
  }

  async function refreshBundles() {
    try {
      const result = await api('/api/bundle-config');
      bundles = result.bundle_promotions || [];
      chargeRules = result.bundle_charge_rules || [];

      renderBundleList();
      renderRuleBundleOptions();
      renderRuleList();
    } catch (error) {
      notify(error.message);
    }
  }

  function renderBundleList() {
    const container = $('#bundleList');

    if (!bundles.length) {
      container.innerHTML =
        '<div class="empty">Belum ada Bundling.</div>';
      return;
    }

    container.innerHTML = bundles.map(bundle => {
      const brand = brands.find(b =>
        Number(b.id) === Number(bundle.brand_id)
      );

      return `
        <div class="admin-row">
          <span>
            <b>${esc(bundle.bundle_name)}</b><br>
            <small>
              ${esc(brand?.name || 'Brand tidak ditemukan')}
              · ${rupiah(bundle.bundle_price)}
              · ${Number(bundle.is_active) ? 'Aktif' : 'Nonaktif'}
            </small>
          </span>
          <button type="button" data-delete-bundle="${bundle.id}">
            Hapus
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-delete-bundle]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          const id = Number(button.dataset.deleteBundle);

          if (!confirm(
            'Hapus Bundling ini beserta produk dan aturan biayanya?'
          )) return;

          try {
            await api('/api/bundle-config', {
              method: 'POST',
              body: JSON.stringify({
                action: 'delete_bundle',
                id
              })
            });

            notify('Bundling berhasil dihapus.');
            await refreshBundles();
          } catch (error) {
            notify(error.message);
          }
        });
      });
  }

  function renderRuleBundleOptions() {
    const select = $('#ruleBundle');
    const previous = select.value;

    select.innerHTML =
      '<option value="">Pilih Bundling</option>' +
      bundles.map(bundle => {
        const brand = brands.find(b =>
          Number(b.id) === Number(bundle.brand_id)
        );

        return `
          <option value="${bundle.id}">
            ${esc(bundle.bundle_name)} — ${esc(brand?.name || '')}
          </option>
        `;
      }).join('');

    if (bundles.some(b => String(b.id) === previous)) {
      select.value = previous;
    }

    renderRuleList();
  }

  function renderRuleTargets() {
    const scope = $('#ruleChargeScope').value;
    const type = $('#ruleScopeType').value;
    const wrap = $('#ruleTargetWrap');
    const select = $('#ruleTarget');
    const label = $('#ruleTargetLabel');

    const bundle = bundles.find(b =>
      Number(b.id) === Number($('#ruleBundle').value)
    );

    const brandId = Number(bundle?.brand_id || 0);

    if (type === 'ALL') {
      wrap.classList.add('hidden');
      select.innerHTML = '';
      return;
    }

    wrap.classList.remove('hidden');

    let items = [];

    if (scope === 'OPTIONS') {
      if (type === 'GROUP') {
        label.textContent = 'Pilih grup Options';
        items = config.option_groups.filter(g =>
          Number(g.brand_id) === brandId
        ).map(g => ({ id: g.id, name: g.group_name }));
      } else if (type === 'VALUE') {
        label.textContent = 'Pilih nilai Option';
        items = config.option_values
          .map(v => {
            const group = config.option_groups.find(g =>
              Number(g.id) === Number(v.option_group_id)
            );
            return group && Number(group.brand_id) === brandId
              ? { id: v.id, name: `${group.group_name} — ${v.value_name}` }
              : null;
          }).filter(Boolean);
      }
    } else {
      if (type === 'GROUP') {
        label.textContent = 'Pilih grup Add-ons';
        items = config.addon_groups.filter(g =>
          Number(g.brand_id) === brandId
        ).map(g => ({ id: g.id, name: g.group_name }));
      } else if (type === 'ITEM') {
        label.textContent = 'Pilih item Add-on';
        items = config.addon_items
          .map(item => {
            const group = config.addon_groups.find(g =>
              Number(g.id) === Number(item.addon_group_id)
            );
            return group && Number(group.brand_id) === brandId
              ? { id: item.id, name: `${group.group_name} — ${item.item_name}` }
              : null;
          }).filter(Boolean);
      }
    }

    select.innerHTML =
      '<option value="">Pilih target</option>' +
      items.map(item =>
        `<option value="${item.id}">${esc(item.name)}</option>`
      ).join('');

    if (!items.length) {
      select.innerHTML =
        '<option value="">Tidak ada pilihan tersedia</option>';
    }
  }

  function renderRulePolicy() {
    const custom = $('#rulePolicy').value === 'CUSTOM';
    $('#ruleCustomWrap').classList.toggle('hidden', !custom);
  }

  async function saveRule(event) {
    event.preventDefault();

    const form = event.target;
    const values = new FormData(form);

    const bundleId = Number(values.get('bundle_id'));
    const scope = values.get('charge_scope');
    const type = values.get('scope_type');
    const policy = values.get('pricing_policy');

    if (!bundleId) {
      notify('Pilih Bundling terlebih dahulu.');
      return;
    }

    const scopeId = type === 'ALL'
      ? null
      : Number(values.get('scope_id'));

    if (type !== 'ALL' && !scopeId) {
      notify('Pilih grup atau item yang akan diatur.');
      return;
    }

    const customPrice = Number(values.get('custom_price_delta') || 0);

    if (policy === 'CUSTOM' && customPrice < 0) {
      notify('Biaya khusus tidak boleh negatif.');
      return;
    }

    const status = $('#ruleStatus');

    try {
      status.textContent = 'Menyimpan aturan biaya...';

      await api('/api/bundle-config', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_rule',
          bundle_id: bundleId,
          charge_scope: scope,
          scope_type: type,
          scope_id: scopeId,
          pricing_policy: policy,
          custom_price_delta: customPrice,
          notes: values.get('notes')
        })
      });

      status.textContent = 'Aturan biaya berhasil disimpan.';
      notify('Aturan biaya berhasil disimpan.');

      form.querySelector('[name="scope_type"]').value = 'ALL';
      form.querySelector('[name="pricing_policy"]').value = 'STANDARD';
      form.querySelector('[name="custom_price_delta"]').value = 0;
      form.querySelector('[name="notes"]').value = '';

      renderRuleTargets();
      renderRulePolicy();

      await refreshBundles();
    } catch (error) {
      status.textContent = error.message;
      notify(error.message);
    }
  }

  function renderRuleList() {
    const container = $('#ruleList');
    if (!container) return;

    const bundleId = Number($('#ruleBundle')?.value || 0);

    if (!bundleId) {
      container.innerHTML =
        '<p class="muted">Pilih Bundling terlebih dahulu.</p>';
      return;
    }

    const rules = chargeRules.filter(rule =>
      Number(rule.bundle_id) === bundleId
    );

    if (!rules.length) {
      container.innerHTML =
        '<p class="muted">Belum ada aturan biaya untuk Bundling ini.</p>';
      return;
    }

    container.innerHTML = rules.map(rule => {
      const scopeName = rule.charge_scope === 'OPTIONS'
        ? 'Options'
        : 'Add-ons';

      let targetName = 'Semua pilihan';

      if (rule.scope_type === 'GROUP') {
        const groups = rule.charge_scope === 'OPTIONS'
          ? config.option_groups
          : config.addon_groups;

        targetName = groups.find(g =>
          Number(g.id) === Number(rule.scope_id)
        )?.group_name || 'Grup tidak ditemukan';
      }

      if (rule.scope_type === 'VALUE') {
        targetName = config.option_values.find(v =>
          Number(v.id) === Number(rule.scope_id)
        )?.value_name || 'Nilai tidak ditemukan';
      }

      if (rule.scope_type === 'ITEM') {
        targetName = config.addon_items.find(v =>
          Number(v.id) === Number(rule.scope_id)
        )?.item_name || 'Item tidak ditemukan';
      }

      const policyNames = {
        STANDARD: 'STANDARD — Harga normal',
        INCLUDED: 'INCLUDED — Termasuk paket',
        CUSTOM: 'CUSTOM — Harga khusus'
      };

      const customText = rule.pricing_policy === 'CUSTOM'
        ? ' · ' + rupiah(rule.custom_price_delta)
        : '';

      return `
        <div class="admin-row" style="align-items:flex-start">
          <span>
            <b>${scopeName} · ${esc(targetName)}</b><br>
            <small>
              ${esc(policyNames[rule.pricing_policy] || rule.pricing_policy)}
              ${customText}
            </small>
            ${rule.notes
              ? `<br><small class="muted">${esc(rule.notes)}</small>`
              : ''}
          </span>
          <button type="button" data-delete-rule="${rule.id}">
            Hapus
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-delete-rule]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          const id = Number(button.dataset.deleteRule);

          if (!confirm('Hapus aturan biaya ini?')) return;

          try {
            await api('/api/bundle-config', {
              method: 'POST',
              body: JSON.stringify({
                action: 'delete_rule',
                id
              })
            });

            notify('Aturan biaya berhasil dihapus.');
            await refreshBundles();
          } catch (error) {
            notify(error.message);
          }
        });
      });
  }

  addBundleTab();
})();
