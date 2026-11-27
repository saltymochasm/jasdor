
const demo = { brands: [], products: [], outlets: [] };

let data = demo;
let selectedBrand = null;
let category = 'Semua';
let cart = [];
let currentProduct = null;
let adminToken = null;
let qty = 1;

let configData = {
  option_groups: [],
  option_values: [],
  addon_groups: [],
  addon_items: []
};

let productLinks = {
  product_option_groups: [],
  product_addon_groups: []
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rupiah = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function toast(s) {
  const t = $('#toast');
  t.textContent = s;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2300);
}

function open(id) {
  $('#' + id).classList.remove('hidden');
}

function close(id) {
  $('#' + id).classList.add('hidden');
}

$$('[data-close]').forEach(b => {
  b.onclick = () => close(b.dataset.close);
});

$$('.overlay').forEach(o => {
  o.addEventListener('click', e => {
    if (e.target === o) close(o.id);
  });
});

// =====================================
// DATA KATALOG
// =====================================

async function load() {
  try {
    const r = await fetch('/api/data');
    if (!r.ok) throw new Error('Gagal memuat katalog');

    const d = await r.json();

    data = {
      brands: d.brands || [],
      products: d.products || [],
      outlets: d.outlets || []
    };
  } catch (e) {
    console.error(e);
    toast('Katalog gagal dimuat. Periksa koneksi.');
  }

  renderBrands();
  renderProducts();
  renderOutlets();
  $('#year').textContent = new Date().getFullYear();
}

function renderBrands() {
  const el = $('#brandList');

  $('#brandTotal').textContent = `${data.brands.length} brand`;

  el.innerHTML = data.brands.map(b => `
    <button class="brand-card ${selectedBrand?.id == b.id ? 'selected' : ''}"
      data-brand="${b.id}">
      <span class="brand-logo" style="background:${esc(b.color || '#eee5da')}">
        ${b.logo
          ? `<img src="${esc(b.logo)}" alt="">`
          : esc((b.name || '?').slice(0, 1))}
      </span>
      <span>
        <strong>${esc(b.name)}</strong>
        <small>${esc(b.description || 'Lihat menu tersedia')}</small>
      </span>
    </button>
  `).join('');

  $$('[data-brand]').forEach(b => {
    b.onclick = () => {
      selectedBrand = data.brands.find(x => x.id == b.dataset.brand);
      category = 'Semua';
      renderBrands();
      renderProducts();
      renderOutlets();
      $('#catalog').scrollIntoView({ behavior: 'smooth' });
    };
  });
}

function renderProducts() {
  const products = data.products.filter(
    p => !selectedBrand || p.brand_id == selectedBrand.id
  );

  $('#catalogTitle').textContent = selectedBrand
    ? `Menu ${selectedBrand.name}`
    : 'Menu pilihan';

  $('#catalogSub').textContent = selectedBrand
    ? `${products.length} menu tersedia · pilih menu untuk custom pesanan`
    : 'Pilih brand untuk melihat menu yang tersedia.';

  const cats = ['Semua', ...new Set(products.map(p => p.category || 'Menu'))];

  if (!cats.includes(category)) category = 'Semua';

  $('#categoryList').innerHTML = cats.map(c => `
    <button class="chip ${category === c ? 'active' : ''}"
      data-cat="${esc(c)}">${esc(c)}</button>
  `).join('');

  $$('[data-cat]').forEach(b => {
    b.onclick = () => {
      category = b.dataset.cat;
      renderProducts();
    };
  });

  const q = $('#search').value.toLowerCase();

  const filtered = products.filter(p =>
    (category === 'Semua' || p.category === category) &&
    (`${p.name} ${p.description || ''}`).toLowerCase().includes(q)
  );

  $('#productList').innerHTML = filtered.length
    ? filtered.map(p => `
      <article class="product-card">
        <div class="product-image">
          ${p.image
            ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">`
            : `<span class="product-placeholder">${esc(p.name.slice(0, 1))}</span>`}
        </div>
        <div class="product-info">
          <small>${esc(p.category || 'MENU')}</small>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || 'Menu pilihan')}</p>
          <span class="price">${rupiah(p.price)}</span>
          ${p.compare_price
            ? `<span class="old-price">${rupiah(p.compare_price)}</span>
               <span class="discount">PROMO</span>`
            : ''}
        </div>
        <button class="add-btn" data-product="${p.id}">+</button>
      </article>
    `).join('')
    : '<div class="empty">Menu belum tersedia atau tidak ditemukan.</div>';

  $$('[data-product]').forEach(b => {
    b.onclick = () => showProduct(Number(b.dataset.product));
  });
}

$('#search').addEventListener('input', renderProducts);

// =====================================
// DETAIL PRODUK
// =====================================

function showProduct(id) {
  currentProduct = data.products.find(p => p.id == id);
  if (!currentProduct) return;

  qty = 1;
  const p = currentProduct;

  const hasNewOptions = (p.config_options || []).length > 0;
  const hasNewAddons = (p.config_addons || []).length > 0;

  const optionHtml = hasNewOptions
    ? p.config_options.map(g => {
        const single = g.selection_type !== 'MULTIPLE';
        const required = Number(g.is_required) === 1;
        const min = required && Number(g.min_select || 0) < 1
          ? 1
          : Number(g.min_select || 0);

        return `
          <div class="option-group config-group"
            data-kind="option"
            data-group="${g.id}"
            data-min="${min}"
            data-max="${g.max_select ?? ''}"
            data-single="${single ? 1 : 0}">
            <h4>
              ${esc(g.group_name)}
              ${required || min > 0 ? '<small> · wajib</small>' : '<small> · opsional</small>'}
            </h4>
            ${g.description
              ? `<p class="muted">${esc(g.description)}</p>`
              : ''}
            <div class="option-row">
              ${(g.values || []).map(v => `
                <label class="option-choice">
                  <input
                    type="${single ? 'radio' : 'checkbox'}"
                    name="option_group_${g.id}"
                    data-config-option
                    data-group="${g.id}"
                    data-id="${v.id}"
                    data-name="${esc(v.value_name)}"
                    data-price="${Number(v.price_delta || 0)}">
                  ${esc(v.value_name)}
                  ${Number(v.price_delta)
                    ? `<small> +${rupiah(v.price_delta)}</small>`
                    : ''}
                </label>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')
    : `
      <div class="option-group">
        <h4>Ukuran</h4>
        <div class="option-row">
          ${(p.options?.length
            ? p.options
            : [{ name: 'Regular', price: 0 }]
          ).map((o, i) => `
            <button class="option-choice ${i === 0 ? 'active' : ''}"
              data-legacy-option="${i}">
              ${esc(o.name)}
              ${o.price ? ` +${rupiah(o.price)}` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;

  const addonHtml = hasNewAddons
    ? p.config_addons.map(g => {
        const single = g.selection_type === 'SINGLE';

        return `
          <div class="option-group config-group"
            data-kind="addon"
            data-group="${g.id}"
            data-min="${Number(g.min_select || 0)}"
            data-max="${g.max_select ?? ''}"
            data-single="${single ? 1 : 0}">
            <h4>${esc(g.group_name)}
              <small>
                ${Number(g.min_select || 0) > 0
                  ? ` · minimal ${g.min_select}`
                  : ' · opsional'}
              </small>
            </h4>
            ${g.description
              ? `<p class="muted">${esc(g.description)}</p>`
              : ''}
            ${(g.items || []).map(a => `
              <div class="addon-row">
                <label>
                  <input
                    type="${single ? 'radio' : 'checkbox'}"
                    name="addon_group_${g.id}"
                    data-config-addon
                    data-group="${g.id}"
                    data-id="${a.id}"
                    data-name="${esc(a.item_name)}"
                    data-price="${Number(a.price_delta || 0)}">
                  ${esc(a.item_name)}
                </label>
                <b>+${rupiah(a.price_delta)}</b>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')
    : `
      <div class="option-group">
        <h4>Add-on <small>· opsional, boleh lebih dari satu</small></h4>
        ${(p.addons || []).length
          ? p.addons.map((a, i) => `
            <div class="addon-row">
              <label>
                <input type="checkbox" data-legacy-addon="${i}">
                ${esc(a.name)}
              </label>
              <b>+${rupiah(a.price)}</b>
            </div>
          `).join('')
          : '<p class="muted">Tidak ada add-on.</p>'}
      </div>
    `;

  $('#productDetail').innerHTML = `
    <span class="eyebrow">${esc(p.category || 'MENU')}</span>
    <div class="detail-image">
      ${p.image
        ? `<img src="${esc(p.image)}" alt="">`
        : `<div class="product-placeholder">${esc(p.name.slice(0, 1))}</div>`}
    </div>
    <h2>${esc(p.name)}</h2>
    <p class="muted">${esc(p.description || '')}</p>
    <div class="detail-price" id="detailPrice">${rupiah(p.price)}</div>

    ${optionHtml}
    ${addonHtml}

    <div class="option-group">
      <h4>Catatan</h4>
      <textarea id="itemNote" placeholder="Contoh: less ice, less sugar..."></textarea>
    </div>

    <div class="qty">
      <button id="qtyMinus">−</button>
      <b id="qtyValue">1</b>
      <button id="qtyPlus">+</button>
    </div>

    <button id="addToCart" class="primary full">
      Tambah ke keranjang · ${rupiah(p.price)}
    </button>
  `;

  // Pilihan lama
  $$('[data-legacy-option]').forEach(b => {
    b.onclick = () => {
      $$('[data-legacy-option]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      updateProductPrice();
    };
  });

  // Semua pilihan baru
  $$('[data-config-option], [data-config-addon]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.type === 'radio' && input.checked) {
        const group = input.dataset.group;
        $$(`[name="${input.name}"]`).forEach(x => {
          x.closest('label')?.classList.toggle('active', x.checked);
        });
      }

      if (input.type === 'checkbox') {
        input.closest('label')?.classList.toggle('active', input.checked);
      }

      updateProductPrice();
    });
  });

  // Pilihan lama add-on
  $$('[data-legacy-addon]').forEach(input => {
    input.onchange = updateProductPrice;
  });

  $('#qtyMinus').onclick = () => {
    qty = Math.max(1, qty - 1);
    $('#qtyValue').textContent = qty;
    updateProductPrice();
  };

  $('#qtyPlus').onclick = () => {
    qty++;
    $('#qtyValue').textContent = qty;
    updateProductPrice();
  };

  $('#addToCart').onclick = addCurrentToCart;

  open('productModal');
  updateProductPrice();
}

function selectedConfigInputs(selector) {
  return $$(selector).filter(x => x.checked);
}

function currentSelectionPrice() {
  const p = currentProduct;
  if (!p) return 0;

  const newOptions = selectedConfigInputs('[data-config-option]');
  const newAddons = selectedConfigInputs('[data-config-addon]');

  const oldOption = p.config_options?.length
    ? null
    : p.options?.[
        Number($('[data-legacy-option].active')?.dataset.legacyOption || 0)
      ] || { price: 0 };

  const oldAddons = p.config_addons?.length
    ? []
    : (p.addons || []).filter((a, i) =>
        $(`[data-legacy-addon="${i}"]`)?.checked
      );

  return Number(p.price || 0)
    + Number(oldOption?.price || 0)
    + newOptions.reduce((s, x) => s + Number(x.dataset.price || 0), 0)
    + newAddons.reduce((s, x) => s + Number(x.dataset.price || 0), 0)
    + oldAddons.reduce((s, x) => s + Number(x.price || 0), 0);
}

function updateProductPrice() {
  if (!currentProduct) return;

  const unit = currentSelectionPrice();

  $('#detailPrice').textContent = rupiah(unit);
  $('#addToCart').textContent =
    `Tambah ke keranjang · ${rupiah(unit * qty)}`;
}

function validateConfigGroups() {
  const groups = $$('.config-group');

  for (const group of groups) {
    const selected = group.querySelectorAll(
      '[data-config-option]:checked, [data-config-addon]:checked'
    );

    const count = selected.length;
    const min = Number(group.dataset.min || 0);
    const max = group.dataset.max === ''
      ? null
      : Number(group.dataset.max);

    const name = group.querySelector('h4')?.textContent.trim() || 'Pilihan';

    if (count < min) {
      toast(`${name}: pilih minimal ${min} pilihan.`);
      return false;
    }

    if (max !== null && count > max) {
      toast(`${name}: maksimal ${max} pilihan.`);
      return false;
    }

    if (group.dataset.single === '1' && count > 1) {
      toast(`${name}: hanya boleh memilih satu.`);
      return false;
    }
  }

  return true;
}

function addCurrentToCart() {
  const p = currentProduct;
  if (!p) return;

  if (!validateConfigGroups()) return;

  const newOptions = selectedConfigInputs('[data-config-option]');
  const newAddons = selectedConfigInputs('[data-config-addon]');

  const oldOption = p.config_options?.length
    ? null
    : p.options?.[
        Number($('[data-legacy-option].active')?.dataset.legacyOption || 0)
      ] || { name: 'Regular', price: 0 };

  const oldAddons = p.config_addons?.length
    ? []
    : (p.addons || []).filter((a, i) =>
        $(`[data-legacy-addon="${i}"]`)?.checked
      );

  const choices = [
    ...newOptions.map(x => ({
      group: x.closest('.config-group')?.querySelector('h4')?.textContent.trim() || 'Option',
      name: x.dataset.name,
      price: Number(x.dataset.price || 0),
      kind: 'option'
    })),
    ...newAddons.map(x => ({
      group: x.closest('.config-group')?.querySelector('h4')?.textContent.trim() || 'Add-on',
      name: x.dataset.name,
      price: Number(x.dataset.price || 0),
      kind: 'addon'
    }))
  ];

  const unit = currentSelectionPrice();
  const note = $('#itemNote').value.trim();

  cart.push({
    key: Date.now() + Math.random(),
    product_id: p.id,
    name: p.name,
    option: oldOption?.name || '',
    addons: oldAddons,
    choices,
    note,
    qty,
    unit,
    brand_id: p.brand_id
  });

  updateCart();
  close('productModal');
  toast('Menu ditambahkan ke keranjang');
}

// =====================================
// KERANJANG
// =====================================

function updateCart() {
  const count = cart.reduce((s, x) => s + x.qty, 0);

  $('#cartCount').textContent = count;

  $('#cartTotal').textContent = rupiah(
    cart.reduce((s, x) => s + x.unit * x.qty, 0)
  );

  renderCart();
}

function renderCart() {
  const el = $('#cartItems');

  if (!cart.length) {
    el.innerHTML = '<div class="empty">Keranjang masih kosong.</div>';
    return;
  }

  el.innerHTML = cart.map(x => {
    const detail = [];

    if (x.option) detail.push(esc(x.option));

    if (x.choices?.length) {
      x.choices.forEach(c => {
        detail.push(`${esc(c.group)}: ${esc(c.name)}`);
      });
    }

    if (x.addons?.length) {
      detail.push(
        'Add-on: ' + x.addons.map(a => esc(a.name)).join(', ')
      );
    }

    if (x.note) detail.push('Catatan: ' + esc(x.note));

    return `
      <div class="cart-item">
        <div>
          <strong>${esc(x.name)} × ${x.qty}</strong>
          <small>
            ${detail.join('<br>')}
            <br>${rupiah(x.unit * x.qty)}
          </small>
        </div>
        <button data-remove="${x.key}">Hapus</button>
      </div>
    `;
  }).join('');

  $$('[data-remove]').forEach(b => {
    b.onclick = () => {
      cart = cart.filter(x => x.key != b.dataset.remove);
      updateCart();
    };
  });
}

function renderOutlets() {
  const b = selectedBrand;
  const outlets = data.outlets.filter(o => !b || o.brand_id == b.id);

  $('#outletSelect').innerHTML =
    '<option value="">Pilih outlet (jika tersedia)</option>' +
    outlets.map(o => `
      <option value="${o.id}">
        ${esc(o.name)}${o.address ? ' — ' + esc(o.address) : ''}
      </option>
    `).join('');
}

$('#cartOpen').onclick = () => {
  renderCart();
  renderOutlets();
  open('cartModal');
};

$('#pickup').onchange = () => {
  $('#pickupTimeWrap').classList.toggle(
    'hidden',
    $('#pickup').value !== 'Atur jam'
  );
};

// =====================================
// CHECKOUT WHATSAPP
// =====================================

$('#sendOrder').onclick = () => {
  if (!cart.length) return toast('Keranjang masih kosong');

  const brandIds = [...new Set(cart.map(x => x.brand_id))];

  if (brandIds.length !== 1) {
    return toast('Satu checkout hanya untuk satu brand. Pisahkan pesanan per brand.');
  }

  const brand = data.brands.find(b => b.id == brandIds[0]);

  if (!brand?.whatsapp) {
    return toast('Nomor WhatsApp admin belum diatur');
  }

  const name = $('#customerName').value.trim();
  if (!name) return toast('Isi nama pemesan terlebih dahulu');

  const outlet = data.outlets.find(
    o => o.id == $('#outletSelect').value
  );

  const total = cart.reduce((s, x) => s + x.unit * x.qty, 0);

  let msg = `*PESANAN JASDOR*\nBrand: ${brand.name}\nNama: ${name}`;

  if ($('#customerPhone').value) {
    msg += `\nWhatsApp: ${$('#customerPhone').value}`;
  }

  msg += '\n\n*DETAIL PESANAN*';

  cart.forEach((x, i) => {
    msg += `\n\n${i + 1}. ${x.name}\n`;

    if (x.option) {
      msg += `   ${x.option}\n`;
    }

    if (x.choices?.length) {
      x.choices.forEach(c => {
        msg += `   ${c.group}: ${c.name}`;
        if (c.price) msg += ` (+${rupiah(c.price)})`;
        msg += '\n';
      });
    }

    if (x.addons?.length) {
      msg += `   Add-on: ${x.addons.map(a => a.name).join(', ')}\n`;
    }

    if (x.note) msg += `   Catatan: ${x.note}\n`;

    msg += `   ${x.qty} × ${rupiah(x.unit)} = ${rupiah(x.qty * x.unit)}`;
  });

  msg += `\n\n*TOTAL: ${rupiah(total)}*`;

  msg += `\nWaktu pickup: ${
    $('#pickup').value === 'Atur jam'
      ? $('#pickupTime').value
      : 'Sekarang'
  }`;

  if (outlet) msg += `\nOutlet: ${outlet.name}`;

  if ($('#orderNote').value) {
    msg += `\nCatatan pesanan: ${$('#orderNote').value}`;
  }

  window.open(
    `https://wa.me/${brand.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
    '_blank'
  );
};

// =====================================
// LOGIN ADMIN
// =====================================

$('#adminOpen').onclick = () => open('adminModal');

$('#loginBtn').onclick = async () => {
  const pw = $('#adminPassword').value;

  try {
    const r = await fetch('/api/admin?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });

    const d = await r.json();
    if (!r.ok) throw Error(d.error || 'Login gagal');

    adminToken = d.token;

    $('#adminLogin').classList.add('hidden');
    $('#adminPanel').classList.remove('hidden');

    await renderAdmin();
  } catch (e) {
    $('#loginError').textContent = e.message;
  }
};

// =====================================
// API ADMIN
// =====================================

async function adminPost(action, body) {
  const r = await fetch('/api/admin?action=' + action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken
    },
    body: JSON.stringify(body)
  });

  const d = await r.json();
  if (!r.ok) throw Error(d.error || 'Operasi gagal');

  await load();
  await renderAdmin();
  toast('Data berhasil disimpan');
}

async function loadAdminConfig() {
  if (!adminToken) return;

  const r = await fetch('/api/admin-config', {
    headers: { 'Authorization': 'Bearer ' + adminToken }
  });

  const d = await r.json();

  if (!r.ok) {
    throw Error(d.error || 'Gagal membaca Options dan Add-ons');
  }

  configData = {
    option_groups: d.option_groups || [],
    option_values: d.option_values || [],
    addon_groups: d.addon_groups || [],
    addon_items: d.addon_items || []
  };
}

async function adminConfigPost(body) {
  const r = await fetch('/api/admin-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken
    },
    body: JSON.stringify(body)
  });

  const d = await r.json();

  if (!r.ok) {
    throw Error(d.error || 'Gagal menyimpan konfigurasi');
  }

  await loadAdminConfig();
  renderConfigLists();
  await loadProductLinks();
  renderProductLinkForm();

  toast('Konfigurasi berhasil disimpan');
}

// =====================================
// HUBUNGAN PRODUK
// =====================================

async function loadProductLinks() {
  if (!adminToken) return;

  const r = await fetch('/api/product-config', {
    headers: { 'Authorization': 'Bearer ' + adminToken }
  });

  const d = await r.json();

  if (!r.ok) {
    throw Error(d.error || 'Gagal membaca hubungan produk');
  }

  productLinks = {
    product_option_groups: d.product_option_groups || [],
    product_addon_groups: d.product_addon_groups || []
  };
}

async function saveProductLinks() {
  const productId = Number($('#linkProductSelect').value);

  if (!productId) {
    return toast('Pilih produk terlebih dahulu');
  }

  const optionIds = $$('[name="linked_option_group"]:checked')
    .map(el => Number(el.value));

  const addonIds = $$('[name="linked_addon_group"]:checked')
    .map(el => Number(el.value));

  const status = $('#productLinksStatus');
  status.textContent = 'Menyimpan hubungan produk...';

  try {
    const r = await fetch('/api/product-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      },
      body: JSON.stringify({
        product_id: productId,
        option_group_ids: optionIds,
        addon_group_ids: addonIds
      })
    });

    const d = await r.json();

    if (!r.ok) {
      throw Error(d.error || 'Gagal menyimpan hubungan produk');
    }

    await loadProductLinks();
    renderProductLinkForm();

    status.textContent =
      `Berhasil disimpan: ${d.option_groups_saved} grup Options dan ${d.addon_groups_saved} grup Add-ons.`;

    toast('Hubungan produk berhasil disimpan');
  } catch (e) {
    status.textContent = e.message;
    toast(e.message);
  }
}

// =====================================
// NAVIGASI TAB ADMIN
// =====================================

$$('[data-tab]').forEach(b => {
  b.onclick = () => {
    $$('[data-tab]').forEach(x =>
      x.classList.toggle('active', x === b)
    );

    $$('.admin-tab').forEach(x =>
      x.classList.toggle('hidden', x.id !== b.dataset.tab)
    );
  };
});

// =====================================
// TAMPILAN ADMIN
// =====================================

async function renderAdmin() {
  const opts = data.brands.map(b =>
    `<option value="${b.id}">${esc(b.name)}</option>`
  ).join('');

  $$('#productForm select, #outletForm select, #optionGroupForm select[name="brand_id"], #addonGroupForm select[name="brand_id"]')
    .forEach(s => {
      s.innerHTML = '<option value="">Pilih brand</option>' + opts;
    });

  $('#adminBrandList').innerHTML = data.brands.map(b => `
    <div class="admin-row">
      <span>
        <b>${esc(b.name)}</b><br>
        <small>${esc(b.slug)} · ${esc(b.whatsapp)}</small>
      </span>
      <button data-del="brand:${b.id}">Hapus</button>
    </div>
  `).join('');

  $('#adminProductList').innerHTML = data.products.map(p => `
    <div class="admin-row">
      <span>
        <b>${esc(p.name)}</b><br>
        <small>
          ${rupiah(p.price)} ·
          ${esc(data.brands.find(b => b.id == p.brand_id)?.name || '')}
        </small>
      </span>
      <button data-del="product:${p.id}">Hapus</button>
    </div>
  `).join('');

  $('#adminOutletList').innerHTML = data.outlets.map(o => `
    <div class="admin-row">
      <span>
        <b>${esc(o.name)}</b><br>
        <small>${esc(o.address || '')}</small>
      </span>
      <button data-del="outlet:${o.id}">Hapus</button>
    </div>
  `).join('');

  $$('[data-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Hapus data ini?')) return;

      try {
        const [type, id] = b.dataset.del.split(':');
        await adminPost('delete', { type, id });
      } catch (e) {
        toast(e.message);
      }
    };
  });

  try {
    await loadAdminConfig();
    await loadProductLinks();
    renderConfigLists();
    renderProductLinkForm();
  } catch (e) {
    console.error(e);
    toast('Gagal memuat konfigurasi: ' + e.message);
  }
}

// =====================================
// DAFTAR OPTIONS DAN ADD-ONS ADMIN
// =====================================

function renderConfigLists() {
  const optionGroups = configData.option_groups;
  const optionValues = configData.option_values;
  const addonGroups = configData.addon_groups;
  const addonItems = configData.addon_items;

  $('#optionItemForm [name="group_id"]').innerHTML =
    '<option value="">Pilih grup Options</option>' +
    optionGroups.map(g => `
      <option value="${g.id}">${esc(g.group_name)}</option>
    `).join('');

  $('#addonItemForm [name="group_id"]').innerHTML =
    '<option value="">Pilih grup Add-ons</option>' +
    addonGroups.map(g => `
      <option value="${g.id}">${esc(g.group_name)}</option>
    `).join('');

  $('#adminOptionList').innerHTML = optionGroups.length
    ? optionGroups.map(g => {
        const brand = data.brands.find(b => b.id == g.brand_id);
        const values = optionValues.filter(
          v => v.option_group_id == g.id
        );

        return `
          <div class="admin-row">
            <span>
              <b>${esc(g.group_name)}</b><br>
              <small>
                ${esc(brand?.name || 'Brand tidak ditemukan')}
                · ${g.selection_type === 'MULTIPLE' ? 'Bisa pilih beberapa' : 'Pilih satu'}
                · ${Number(g.is_required) ? 'Wajib' : 'Opsional'}
              </small>
              <div>
                ${values.length
                  ? values.map(v => `
                    <div class="admin-row">
                      <span>
                        ${esc(v.value_name)}
                        · ${rupiah(v.price_delta)}
                      </span>
                      <button data-config-delete="option:item:${v.id}">Hapus</button>
                    </div>
                  `).join('')
                  : '<small>Belum ada nilai Option.</small>'}
              </div>
            </span>
            <button data-config-delete="option:group:${g.id}">Hapus grup</button>
          </div>
        `;
      }).join('')
    : '<div class="empty">Belum ada grup Options.</div>';

  $('#adminAddonList').innerHTML = addonGroups.length
    ? addonGroups.map(g => {
        const brand = data.brands.find(b => b.id == g.brand_id);
        const items = addonItems.filter(
          a => a.addon_group_id == g.id
        );

        return `
          <div class="admin-row">
            <span>
              <b>${esc(g.group_name)}</b><br>
              <small>
                ${esc(brand?.name || 'Brand tidak ditemukan')}
                · ${g.selection_type === 'SINGLE' ? 'Pilih satu' : 'Bisa pilih beberapa'}
              </small>
              <div>
                ${items.length
                  ? items.map(a => `
                    <div class="admin-row">
                      <span>
                        ${esc(a.item_name)}
                        · ${rupiah(a.price_delta)}
                      </span>
                      <button data-config-delete="addon:item:${a.id}">Hapus</button>
                    </div>
                  `).join('')
                  : '<small>Belum ada item Add-on.</small>'}
              </div>
            </span>
            <button data-config-delete="addon:group:${g.id}">Hapus grup</button>
          </div>
        `;
      }).join('')
    : '<div class="empty">Belum ada grup Add-ons.</div>';

  $$('[data-config-delete]').forEach(b => {
    b.onclick = async () => {
      const [type, kind, id] = b.dataset.configDelete.split(':');

      const message = kind === 'group'
        ? 'Hapus grup beserta seluruh item di dalamnya?'
        : 'Hapus item ini?';

      if (!confirm(message)) return;

      try {
        await adminConfigPost({
          type,
          action: kind === 'group' ? 'delete_group' : 'delete_item',
          id: Number(id)
        });
      } catch (e) {
        toast(e.message);
      }
    };
  });
}

// =====================================
// FORM HUBUNGAN PRODUK
// =====================================

function renderProductLinkForm() {
  const select = $('#linkProductSelect');
  const previous = select.value;

  select.innerHTML =
    '<option value="">Pilih produk</option>' +
    data.products.map(p => {
      const brand = data.brands.find(b => b.id == p.brand_id);

      return `
        <option value="${p.id}">
          ${esc(brand?.name || '')} — ${esc(p.name)}
        </option>
      `;
    }).join('');

  if (data.products.some(p => String(p.id) === previous)) {
    select.value = previous;
  }

  renderSelectedProductGroups();
}

function renderSelectedProductGroups() {
  const productId = Number($('#linkProductSelect').value);

  const optionContainer = $('#linkOptionGroups');
  const addonContainer = $('#linkAddonGroups');
  const status = $('#productLinksStatus');

  status.textContent = '';

  if (!productId) {
    optionContainer.innerHTML =
      '<p class="muted">Pilih produk terlebih dahulu.</p>';

    addonContainer.innerHTML =
      '<p class="muted">Pilih produk terlebih dahulu.</p>';

    return;
  }

  const product = data.products.find(p => p.id == productId);
  if (!product) return;

  const brandId = Number(product.brand_id);

  const options = configData.option_groups.filter(
    g => Number(g.brand_id) === brandId && Number(g.is_active) !== 0
  );

  const addons = configData.addon_groups.filter(
    g => Number(g.brand_id) === brandId && Number(g.is_active) !== 0
  );

  const linkedOptions = productLinks.product_option_groups
    .filter(x => Number(x.product_id) === productId)
    .map(x => Number(x.option_group_id));

  const linkedAddons = productLinks.product_addon_groups
    .filter(x => Number(x.product_id) === productId)
    .map(x => Number(x.addon_group_id));

  optionContainer.innerHTML = options.length
    ? options.map(g => {
        const values = configData.option_values.filter(
          v => Number(v.option_group_id) === Number(g.id)
        );

        return `
          <label class="inline" style="display:flex;align-items:flex-start;gap:8px;margin:10px 0">
            <input
              type="checkbox"
              name="linked_option_group"
              value="${g.id}"
              ${linkedOptions.includes(Number(g.id)) ? 'checked' : ''}
            >
            <span>
              <b>${esc(g.group_name)}</b><br>
              <small class="muted">
                ${g.selection_type === 'MULTIPLE' ? 'Bisa pilih beberapa' : 'Pilih satu'}
                · ${Number(g.is_required) ? 'Wajib' : 'Opsional'}
                · ${values.length} pilihan
              </small>
            </span>
          </label>
        `;
      }).join('')
    : '<p class="muted">Belum ada grup Options untuk brand produk ini.</p>';

  addonContainer.innerHTML = addons.length
    ? addons.map(g => {
        const items = configData.addon_items.filter(
          a => Number(a.addon_group_id) === Number(g.id)
        );

        return `
          <label class="inline" style="display:flex;align-items:flex-start;gap:8px;margin:10px 0">
            <input
              type="checkbox"
              name="linked_addon_group"
              value="${g.id}"
              ${linkedAddons.includes(Number(g.id)) ? 'checked' : ''}
            >
            <span>
              <b>${esc(g.group_name)}</b><br>
              <small class="muted">
                ${g.selection_type === 'SINGLE' ? 'Pilih satu' : 'Bisa pilih beberapa'}
                · ${items.length} item
              </small>
            </span>
          </label>
        `;
      }).join('')
    : '<p class="muted">Belum ada grup Add-ons untuk brand produk ini.</p>';
}

$('#linkProductSelect').addEventListener('change', renderSelectedProductGroups);
$('#saveProductLinks').onclick = saveProductLinks;

// =====================================
// FORM BRAND, PRODUK, OUTLET
// =====================================

$('#brandForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await adminPost('brand', Object.fromEntries(f));
    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

$('#productForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  const split = v => (v || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const [name, price] = s.split(':');
      return { name, price: Number(price || 0) };
    });

  const options = split(f.get('options'));

  try {
    await adminPost('product', {
      ...Object.fromEntries(f),
      brand_id: Number(f.get('brand_id')),
      price: Number(f.get('price')),
      compare_price: f.get('compare_price')
        ? Number(f.get('compare_price'))
        : null,
      active: f.has('active'),
      options: options.length
        ? options
        : [{ name: 'Regular', price: 0 }],
      addons: split(f.get('addons'))
    });

    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

$('#outletForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await adminPost('outlet', {
      ...Object.fromEntries(f),
      brand_id: Number(f.get('brand_id'))
    });

    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

// =====================================
// FORM OPTIONS DAN ADD-ONS
// =====================================

$('#optionGroupForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await adminConfigPost({
      type: 'option',
      action: 'save_group',
      brand_id: Number(f.get('brand_id')),
      group_name: f.get('group_name'),
      selection_type: f.get('selection_type'),
      is_required: f.has('is_required') ? 1 : 0,
      min_select: Number(f.get('min_select') || 0),
      max_select: f.get('max_select') === ''
        ? null
        : Number(f.get('max_select')),
      display_order: Number(f.get('display_order') || 0),
      description: f.get('description') || ''
    });

    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

$('#optionItemForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await adminConfigPost({
      type: 'option',
      action: 'save_item',
      group_id: Number(f.get('group_id')),
      item_name: f.get('item_name'),
      price_delta: Number(f.get('price_delta') || 0),
      sort_order: Number(f.get('sort_order') || 0)
    });

    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

$('#addonGroupForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await adminConfigPost({
      type: 'addon',
      action: 'save_group',
      brand_id: Number(f.get('brand_id')),
      group_name: f.get('group_name'),
      selection_type: f.get('selection_type'),
      min_select: Number(f.get('min_select') || 0),
      max_select: f.get('max_select') === ''
        ? null
        : Number(f.get('max_select')),
      display_order: Number(f.get('display_order') || 0),
      description: f.get('description') || ''
    });

    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

$('#addonItemForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await adminConfigPost({
      type: 'addon',
      action: 'save_item',
      group_id: Number(f.get('group_id')),
      item_name: f.get('item_name'),
      price_delta: Number(f.get('price_delta') || 0),
      sort_order: Number(f.get('sort_order') || 0)
    });

    e.target.reset();
  } catch (x) {
    toast(x.message);
  }
};

// =====================================
// LOGOUT
// =====================================

$('#logoutBtn').onclick = () => {
  adminToken = null;

  $('#adminPanel').classList.add('hidden');
  $('#adminLogin').classList.remove('hidden');
  $('#adminPassword').value = '';
  $('#loginError').textContent = '';

  configData = {
    option_groups: [],
    option_values: [],
    addon_groups: [],
    addon_items: []
  };

  productLinks = {
    product_option_groups: [],
    product_addon_groups: []
  };
};

// =====================================
// MULAI APLIKASI
// =====================================

load();
