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

// ─────────────────────────────────────────────────────────────
// Main admin menu
// ─────────────────────────────────────────────────────────────
exports.showAdminMenu = async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('👥 Akun Creator', 'admin_accounts').row()
    .text('➕ Tambah Akun Creator', 'admin_add_account').row()
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

// ─────────────────────────────────────────────────────────────
// Central action router
// ─────────────────────────────────────────────────────────────
exports.handleAdminAction = async (ctx, action) => {
  if      (action === 'admin_accounts') await _handleAccounts(ctx);
  else if (action === 'admin_packages') await _handlePackages(ctx);
  else if (action === 'admin_content')  await _handleContent(ctx);
  else if (action === 'admin_report')   await _handleReport(ctx);
  else if (action.startsWith('admin_toggle_')) {
    const id = action.replace('admin_toggle_', '');
    const all = accountManager.getAllAccounts();
    const acc = all.find(a => String(a.id) === id);
    if (acc) accountManager.setAccountActive(id, !acc.active);
    await _handleAccounts(ctx);
  } else if (action.startsWith('admin_reset_')) {
    accountManager.resetAccountLimit(action.replace('admin_reset_', ''));
    await _handleAccounts(ctx);
  } else if (action.startsWith('admin_remove_')) {
    accountManager.removeAccount(action.replace('admin_remove_', ''));
    await _handleAccounts(ctx);
  }
  // admin_add_account ditangani langsung oleh loginHandler
};

// ─────────────────────────────────────────────────────────────
// Account management panel
// ─────────────────────────────────────────────────────────────
async function _handleAccounts(ctx) {
  const all = accountManager.getAllAccounts();
  let text  = '👥 *Manajemen Akun Creator*\n\n';
  text += `Total: ${all.length} akun | Aktif: ${all.filter(a => a.active).length}\n\n`;

  const keyboard = new InlineKeyboard();

  if (!all.length) {
    text += '_Belum ada akun. Gunakan "➕ Tambah Akun Creator"._\n';
  } else {
    all.forEach(a => {
      const status = a.active ? '✅' : '❌';
      const limit  = a.limitReached ? ' ⚠️LIMIT' : '';
      const name   = a.name ? ` (${a.name})` : '';
      text += `${status} ID ${a.id}${name} | ${a.phoneNumber}${limit}\n`;

      keyboard
        .text(`${a.active ? 'Nonaktifkan' : 'Aktifkan'} #${a.id}`, `admin_toggle_${a.id}`)
        .text(`Reset #${a.id}`,  `admin_reset_${a.id}`)
        .text(`Hapus #${a.id}`,  `admin_remove_${a.id}`)
        .row();
    });
  }

  keyboard
    .text('➕ Tambah Akun', 'admin_add_account').row()
    .text('← Admin Menu', 'admin_back');

  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────────────────────
// Package info
// ─────────────────────────────────────────────────────────────
async function _handlePackages(ctx) {
  let text = '📦 *Manajemen Paket*\n\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const [key, pkg] of Object.entries(config.packages)) {
    const count = (config.packageContent[key] || []).length;
    text += `*${pkg.name}* (${key})\n`;
    text += `💰 ${pkg.price} Stars | 📹 ${pkg.videos} video | 📂 ${count} tersedia\n\n`;
  }
  text += '✏️ Edit via `config.js` lalu restart bot.';
  const keyboard = new InlineKeyboard().text('← Admin Menu', 'admin_back');
  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────────────────────
// Content guide
// ─────────────────────────────────────────────────────────────
async function _handleContent(ctx) {
  let text = '📹 *Manajemen Konten*\n\n';
  text += `📌 Source Group ID: \`${config.sourceGroupId}\`\n\n`;
  text += '*Cara tambah konten:*\n';
  text += '1. Upload video ke source group\n';
  text += '2. Klik kanan → Copy Message Link\n';
  text += '3. Ambil angka terakhir dari link (= Message ID)\n';
  text += '4. Tambahkan ke `config.packageContent`\n';
  text += '5. Restart bot\n\n';
  text += '*Konten per paket:*\n';
  for (const [k, ids] of Object.entries(config.packageContent)) {
    const pkg = config.packages[k];
    text += `• *${pkg?.name || k}*: ${ids.length} video\n`;
  }
  text += '\n✅ Semua video di-forward langsung — tidak ada penyimpanan file.';
  const keyboard = new InlineKeyboard().text('← Admin Menu', 'admin_back');
  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}

// ─────────────────────────────────────────────────────────────
// Sales report
// ─────────────────────────────────────────────────────────────
async function _handleReport(ctx) {
  const purchases = loadJSON(purchaseFile);
  const warranty  = loadJSON(warrantyFile);

  const all       = Object.values(purchases).flat();
  const completed = all.filter(p => p.status === 'completed');
  const failed    = all.filter(p => p.status === 'failed');
  const revenue   = completed.reduce((s, p) => s + (p.amount || 0), 0);

  const byPkg = {};
  completed.forEach(p => {
    if (!byPkg[p.packageId]) byPkg[p.packageId] = { count: 0, revenue: 0 };
    byPkg[p.packageId].count++;
    byPkg[p.packageId].revenue += p.amount || 0;
  });

  const allW    = Object.values(warranty).flat();
  const wUsed   = allW.filter(w => w.warrantyUsed).length;
  const wAvail  = allW.filter(w => !w.warrantyUsed).length;

  let text = '📊 *LAPORAN PENJUALAN*\n\n━━━━━━━━━━━━━━━━━━━━\n';
  text += `👥 Total User   : ${Object.keys(purchases).length}\n`;
  text += `🛍️ Total Transaksi: ${all.length}\n`;
  text += `✅ Berhasil     : ${completed.length}\n`;
  text += `❌ Gagal        : ${failed.length}\n`;
  text += `💰 Total Revenue: ${revenue} Stars\n\n`;
  text += '*Per Paket:*\n';
  for (const [k, s] of Object.entries(byPkg)) {
    const pkg = config.packages[k];
    text += `• ${pkg?.name || k}: ${s.count}x — ${s.revenue} Stars\n`;
  }
  text += `\n*Garansi:*\n• Digunakan: ${wUsed} | Tersedia: ${wAvail}\n`;
  text += '━━━━━━━━━━━━━━━━━━━━';

  const keyboard = new InlineKeyboard().text('← Admin Menu', 'admin_back');
  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
}
