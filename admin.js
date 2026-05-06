const { InlineKeyboard } = require('grammy');
const fs   = require('fs');
const path = require('path');

const accountManager = require('../services/accountManager');
const config         = require('../config');

const purchaseFile = path.join('./data', 'purchases.json');
const warrantyFile = path.join('./data', 'warranty.json');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

// ─────────────────────────────────────────────
// Main admin menu
// ─────────────────────────────────────────────
exports.showAdminMenu = async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('👥 Akun Creator', 'admin_accounts').row()
    .text('📦 Paket', 'admin_packages').row()
    .text('📹 Konten', 'admin_content').row()
    .text('📊 Laporan', 'admin_report').row()
    .text('← Kembali', 'back_main');

  await ctx.reply(
    '🔐 *PANEL ADMIN*\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'Pilih menu pengelolaan:\n' +
    '━━━━━━━━━━━━━━━━━━━━',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
};

// ─────────────────────────────────────────────
// Central action router
// ─────────────────────────────────────────────
exports.handleAdminAction = async (ctx, action) => {
  if      (action === 'admin_accounts')  await handleAccounts(ctx);
  else if (action === 'admin_packages')  await handlePackages(ctx);
  else if (action === 'admin_content')   await handleContent(ctx);
  else if (action === 'admin_report')    await handleReport(ctx);
  else if (action.startsWith('admin_toggle_')) {
    const id = parseInt(action.replace('admin_toggle_', ''));
    _toggleAccount(id);
    await handleAccounts(ctx);
  } else if (action.startsWith('admin_reset_')) {
    const id = parseInt(action.replace('admin_reset_', ''));
    accountManager.resetAccountLimit(id);
    await handleAccounts(ctx);
  }
};

// ─────────────────────────────────────────────
// Account management
// ─────────────────────────────────────────────
async function handleAccounts(ctx) {
  const all = accountManager.getAllAccounts();

  let text = '👥 *Manajemen Akun Creator*\n\n';
  text += `Total akun: ${all.length}\n`;
  text += `Akun aktif: ${all.filter(a => a.active).length}\n\n`;

  const keyboard = new InlineKeyboard();

  all.forEach(a => {
    const status      = a.active ? '✅' : '❌';
    const limitBadge  = a.limitReached ? ' ⚠️ LIMIT' : '';
    text += `${status} ID ${a.id} | ${a.phoneNumber}${limitBadge}\n`;

    keyboard
      .text(`${a.active ? 'Nonaktifkan' : 'Aktifkan'} #${a.id}`, `admin_toggle_${a.id}`)
      .text(`Reset Limit #${a.id}`, `admin_reset_${a.id}`)
      .row();
  });

  text += '\n💡 Tambah akun baru via `config.js` → restart bot.';
  text += '\n💡 Session string diisi setelah login MTProto.';

  keyboard.text('← Admin Menu', 'admin_back');

  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────
// Package info
// ─────────────────────────────────────────────
async function handlePackages(ctx) {
  let text = '📦 *Manajemen Paket*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';

  for (const [key, pkg] of Object.entries(config.packages)) {
    const contentCount = (config.packageContent[key] || []).length;
    text += `*${pkg.name}* (ID: ${key})\n`;
    text += `💰 ${pkg.price} Stars | 📹 ${pkg.videos} video\n`;
    text += `📂 Konten terdaftar: ${contentCount} message ID\n\n`;
  }

  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += '✏️ Untuk edit paket:\n';
  text += '1. Buka `config.js`\n';
  text += '2. Edit bagian `packages`\n';
  text += '3. Restart bot\n';

  const keyboard = new InlineKeyboard().text('← Admin Menu', 'admin_back');
  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────
// Content management guide
// ─────────────────────────────────────────────
async function handleContent(ctx) {
  let text = '📹 *Manajemen Konten*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += `📌 Source Group ID: \`${config.sourceGroupId}\`\n\n`;

  text += '📋 *Cara Tambah Konten:*\n';
  text += '1. Upload/forward video ke source group\n';
  text += '2. Klik kanan pesan → "Copy Message Link"\n';
  text += '3. Ambil angka terakhir dari link (= Message ID)\n';
  text += '4. Tambahkan Message ID ke `config.packageContent`\n';
  text += '5. Restart bot\n\n';

  text += '📦 *Isi Konten per Paket:*\n';
  for (const [key, ids] of Object.entries(config.packageContent)) {
    const pkg = config.packages[key];
    text += `• *${pkg?.name || key}*: ${ids.length} video (ID: ${ids[0]}–${ids[ids.length - 1]})\n`;
  }

  text += '\n✅ Tidak ada penyimpanan file di server!\n';
  text += 'Semua video di-forward langsung dari source group.';

  const keyboard = new InlineKeyboard().text('← Admin Menu', 'admin_back');
  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────
// Sales report
// ─────────────────────────────────────────────
async function handleReport(ctx) {
  const purchases = loadJSON(purchaseFile);
  const warranty  = loadJSON(warrantyFile);

  const allPurchases = Object.values(purchases).flat();
  const completed    = allPurchases.filter(p => p.status === 'completed');
  const failed       = allPurchases.filter(p => p.status === 'failed');
  const totalRevenue = completed.reduce((s, p) => s + (p.amount || 0), 0);

  // Revenue per package
  const byPackage = {};
  completed.forEach(p => {
    if (!byPackage[p.packageId]) byPackage[p.packageId] = { count: 0, revenue: 0 };
    byPackage[p.packageId].count++;
    byPackage[p.packageId].revenue += p.amount || 0;
  });

  // Warranty stats
  const allWarranty     = Object.values(warranty).flat();
  const warrantyUsed    = allWarranty.filter(w => w.warrantyUsed).length;
  const warrantyPending = allWarranty.filter(w => !w.warrantyUsed).length;

  let text = '📊 *LAPORAN PENJUALAN*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += `👥 Total Pengguna: ${Object.keys(purchases).length}\n`;
  text += `🛍️ Total Transaksi: ${allPurchases.length}\n`;
  text += `✅ Berhasil: ${completed.length}\n`;
  text += `❌ Gagal: ${failed.length}\n`;
  text += `💰 Total Revenue: ${totalRevenue} Stars\n\n`;

  text += '📦 *Per Paket:*\n';
  for (const [pkgId, stat] of Object.entries(byPackage)) {
    const pkg = config.packages[pkgId];
    text += `• ${pkg?.name || pkgId}: ${stat.count}x — ${stat.revenue} Stars\n`;
  }

  text += '\n🔥 *Garansi:*\n';
  text += `• Digunakan: ${warrantyUsed}\n`;
  text += `• Tersedia: ${warrantyPending}\n`;
  text += '━━━━━━━━━━━━━━━━━━━━';

  const keyboard = new InlineKeyboard().text('← Admin Menu', 'admin_back');
  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function _toggleAccount(accountId) {
  const all = accountManager.getAllAccounts();
  // getAllAccounts returns copies — use setAccountActive
  const acc = all.find(a => a.id === accountId);
  if (acc) accountManager.setAccountActive(accountId, !acc.active);
}
