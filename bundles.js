
(() => {
  let adminToken = null;
  let brands = [];
  let products = [];
  let bundles = [];
  let loaded = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const rupiah = value =>
    'Rp' + Number(value || 0).toLocaleString('id-ID');

  const $ = selector => document.querySelector(selector);

  // Menangkap token dari proses login Admin yang sudah ada.
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    const url = String(args[0]?.url || args[0] || '');

    if (
      url.includes('/api/admin?action=login') &&
      response.ok
    ) {
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

  function addBundleTab() {
    const tabs = $('.admin-tabs');
    const panel = $('#adminPanel');

    if (!tabs || !panel || $('#bundlesAdmin')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.bundleTab = '1';
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
        <input
          name="bundle_name"
          placeholder="Contoh: Paket Hemat Berdua"
          required
        >

        <label>Deskripsi</label>
        <textarea
          name="description"
          placeholder="Keterangan paket (opsional)"
        ></textarea>

        <label>Harga paket (Rp)</label>
        <input
          name="bundle_price"
          type="number"
          min="0"
          value="0"
          required
        >

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label>
            Minimal produk
            <input
              name="min_products"
              type="number"
              min="1"
              value="1"
              required
            >
          </label>

          <label>
            Maksimal produk
            <input
              name="max_products"
              type="number"
              min="1"
              value="2"
              required
            >
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
    `;

    tabs.after(section);

    button.addEventListener('click', async () => {
      tabs.querySelectorAll('button').forEach(item =>
        item.classList.toggle('active', item === button)
      );

      panel.querySelectorAll('.admin-tab').forEach(item =>
        item.classList.toggle('hidden', item !== section)
      );

      if (!loaded) {
        await loadBundleData();
      }
    });

    $('#bundleBrand').addEventListener('change', renderBundleProducts);
    $('#bundleForm').addEventListener('submit', saveBundle);
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

  async function loadBundleData() {
    const status = $('#bundleStatus');

    try {
      status.textContent = 'Memuat data Bundling...';

      const [catalog, config] = await Promise.all([
        originalFetch('/api/data').then(r => {
          if (!r.ok) throw new Error('Gagal membaca katalog.');
          return r.json();
        }),
        api('/api/bundle-config')
      ]);

      brands = catalog.brands || [];
      products = catalog.products || [];
      bundles = config.bundle_promotions || [];

      const select = $('#bundleBrand');
      select.innerHTML =
        '<option value="">Pilih brand</option>' +
        brands.map(b => `
          <option value="${b.id}">${esc(b.name)}</option>
        `).join('');

      renderBundleProducts();
      renderBundleList();

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
            display:flex;
            gap:9px;
            margin:10px 0;
            align-items:center
          ">
            <input
              type="checkbox"
              name="bundle_product"
              value="${p.id}"
            >
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
      const config = await api('/api/bundle-config');
      bundles = config.bundle_promotions || [];
      renderBundleList();
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

          <button
            type="button"
            data-delete-bundle="${bundle.id}"
          >
            Hapus
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-delete-bundle]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          const id = Number(button.dataset.deleteBundle);

          if (!confirm('Hapus Bundling ini beserta produk dan aturan biayanya?')) {
            return;
          }

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

  addBundleTab();
})();
