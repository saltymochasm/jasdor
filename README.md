# Jasdor — Cloudflare multibrand ordering webapp

Starter MVP untuk katalog multibrand yang mobile-first. Stack: **Cloudflare Pages + Pages Functions + D1**. Pelanggan dapat memilih brand, melihat menu, memilih ukuran/add-on, memasukkan pesanan ke keranjang, memilih outlet/waktu pickup, lalu membuka WhatsApp dengan format order.

## Isi project

- `index.html`, `styles.css`, `app.js` — antarmuka pelanggan dan dashboard admin.
- `functions/api/data.js` — API katalog publik (`GET /api/data`).
- `functions/api/admin.js` — API admin (`POST /api/admin?action=...`). Sesi admin bertanda tangan HMAC dan berlaku 8 jam.
- `migrations/0001_init.sql` — skema database D1.
- `wrangler.toml` — konfigurasi Pages dan binding D1 bernama `DB`.
- `package.json` — perintah lokal dan Wrangler.

## Persiapan

Disarankan memakai laptop/komputer untuk langkah GitHub, Node.js, dan Wrangler. Siapkan akun:

1. GitHub: <https://github.com/signup>
2. Cloudflare: <https://dash.cloudflare.com/sign-up>
3. Node.js versi LTS: <https://nodejs.org/>

## Langkah 1 — Buat database D1

Dari folder project, jalankan:

```bash
npm install
npx wrangler login
npx wrangler d1 create jasdor-db
```

Cloudflare akan menampilkan `database_id`. Salin ID tersebut ke `wrangler.toml`, menggantikan `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Jalankan migrasi ke database production:

```bash
npx wrangler d1 execute jasdor-db --remote --file=migrations/0001_init.sql
```

Pastikan database bernama `jasdor-db` dan binding bernama `DB`.

### Alternatif tanpa terminal (melalui dashboard Cloudflare)

Jika belum memakai Node.js/Wrangler, database juga bisa dibuat dari Cloudflare Dashboard:

1. Buka **Workers & Pages** → **D1 SQL Database** (atau menu D1) → **Create database**. Beri nama `jasdor-db`.
2. Salin `database_id` yang ditampilkan.
3. Edit `wrangler.toml` di repository GitHub dan ganti `REPLACE_WITH_YOUR_D1_DATABASE_ID` dengan ID tersebut. Commit perubahan.
4. Buka database `jasdor-db` → **Console / SQL Editor**. Salin seluruh isi `migrations/0001_init.sql`, jalankan, dan pastikan query berhasil.
5. Lanjutkan deployment Pages melalui GitHub seperti Langkah 4. Pastikan binding `DB` mengarah ke database `jasdor-db`; bila perlu tambahkan melalui Settings → Bindings lalu redeploy.

## Langkah 2 — Uji lokal (opsional, disarankan)

```bash
npm run db:migrate:local
npm run dev
```

Buka alamat lokal yang ditampilkan Wrangler. Untuk menguji dashboard, set secret lokal di file `.dev.vars` (jangan commit file ini):

```text
ADMIN_PASSWORD="GANTI_DENGAN_PASSWORD_PANJANG_DAN_UNIK"
```

## Langkah 3 — Upload source ke GitHub

1. Buat repository kosong bernama `jasdor` di <https://github.com/new>.
2. Jangan pilih opsi untuk menambahkan README, license, atau `.gitignore` karena file tersebut sudah ada di project.
3. Ekstrak ZIP project ini.
4. Upload seluruh **isi folder** project ke root repository. Pastikan folder `functions/` dan `migrations/` berada di root repository, sejajar dengan `index.html`.
5. Commit ke branch `main`.

Repository boleh private. Jangan mengunggah `.dev.vars`, password admin, token, atau kredensial.

## Langkah 4 — Deploy ke Cloudflare Pages

1. Masuk ke <https://dash.cloudflare.com/>.
2. Buka **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Hubungkan GitHub, beri izin ke repository `jasdor`, lalu pilih repository tersebut.
4. Atur project:
   - Project name: `jasdor` (jika tersedia)
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: kosongkan
   - Build output directory: `.`
   - Root directory: `/` atau kosong/default
5. Klik **Save and Deploy**.
6. Karena project memiliki folder `functions/`, gunakan Git integration atau Wrangler. **Jangan gunakan Direct Upload dashboard** untuk project ini; Direct Upload tidak menjalankan Pages Functions.

## Langkah 5 — Tambahkan secret admin

Setelah project dibuat:

1. Buka project Pages `jasdor` → **Settings** → **Variables and Secrets** (nama menu dapat berubah).
2. Tambahkan secret bernama `ADMIN_PASSWORD`.
3. Gunakan password panjang dan unik, minimal 16 karakter. Jangan gunakan password yang sama dengan akun lain.
4. Simpan, lalu lakukan redeploy agar secret tersedia pada deployment.

Sesi dashboard ditandatangani menggunakan HMAC dan kedaluwarsa setelah 8 jam. Token hanya disimpan di memori halaman, bukan localStorage.

## Langkah 6 — Verifikasi binding D1

Buka project Pages → **Settings** → **Bindings**. Pastikan D1 database terhubung dengan:

- Variable name: `DB`
- D1 database: `jasdor-db`

Jika binding ditambahkan atau diubah lewat dashboard, lakukan redeploy. `wrangler.toml` juga mendeklarasikan binding `DB`; pastikan `database_id` sudah diganti dengan ID yang benar sebelum deployment.

## Langkah 7 — Buka dan isi Jasdor

URL awal akan berbentuk `https://jasdor.pages.dev` (nama subdomain bergantung ketersediaan).

1. Buka website, tekan **Admin**, lalu masuk memakai `ADMIN_PASSWORD`.
2. Tambahkan brand. Nomor WhatsApp wajib memakai kode negara tanpa tanda `+`, contoh `62812...`.
3. Tambahkan menu dan pilih brand terkait.
4. Isi harga jual dalam angka rupiah. Untuk harga promo, isi `Harga sebelum diskon` dengan angka lebih tinggi dari harga jual.
5. Opsi ukuran dipisahkan koma, contoh `Regular, Large:5000`.
6. Add-on dipisahkan koma, contoh `Extra shot:6000, Oreo:4000`.
7. Tambahkan outlet, alamat, dan keterangan jam operasional.
8. Buka halaman pelanggan dan coba checkout. WhatsApp akan terbuka dengan pesan terformat; pelanggan tetap harus menekan tombol **Kirim** di WhatsApp.

## Batas MVP saat ini

- Dashboard dapat menambah dan menghapus brand, menu, dan outlet. Fitur edit data yang sudah tersimpan belum tersedia.
- Foto/logo diisi menggunakan URL gambar publik. Upload file dari perangkat belum dibuat.
- Jam operasional outlet ditampilkan sebagai informasi; validasi otomatis buka/tutup belum dibuat.
- Checkout dibatasi satu brand per transaksi agar tujuan WhatsApp tidak tercampur.
- Metode pembayaran dan pencatatan order di database belum dibuat; konfirmasi transaksi dilakukan melalui WhatsApp.
- Data contoh di antarmuka hanya placeholder demonstrasi. Menu, harga, foto, dan logo harus diverifikasi serta digunakan dengan izin pemilik merek sebelum dipublikasikan.

## Keamanan dan operasional

- `ADMIN_PASSWORD` harus disimpan sebagai Cloudflare secret, bukan di source code atau Google Sheet publik.
- Jangan commit `.dev.vars` atau file `.env`.
- Gunakan password admin kuat dan ganti segera jika pernah dibagikan.
- Tambahkan Cloudflare WAF/rate limiting untuk endpoint login sebelum trafik publik meningkat.
- D1 Free memiliki kuota dan batas penyimpanan; pantau penggunaan di dashboard Cloudflare.
- Lakukan backup data sebelum perubahan skema database.

## Referensi resmi

- Pages Git integration: <https://developers.cloudflare.com/pages/configuration/git-integration/>
- Pages Functions: <https://developers.cloudflare.com/pages/functions/get-started/>
- Pages bindings (D1): <https://developers.cloudflare.com/pages/functions/bindings/>
- D1 limits: <https://developers.cloudflare.com/d1/platform/limits/>
