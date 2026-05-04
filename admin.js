const { InlineKeyboard } = require('grammy');
const fs = require('fs');
const config = require('../config');

exports.showAdminMenu = async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('👥 Kelola Akun Creator', 'admin_accounts')
    .row()
    .text('📦 Kelola Paket', 'admin_packages')
    .row()
    .text('📹 Kelola Konten', 'admin_content')
    .row()
    .text('📊 Laporan Penjualan', 'admin_report')
    .row()
    .text('← Kembali', 'back_main');

  await ctx.reply(
    '🔐 *PANEL ADMIN*\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'Pilih menu pengelolaan:\n' +
    '━━━━━━━━━━━━━━━━━━━━\n',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
};

// Stubs for admin features
exports.handleAdminAccounts = async (ctx) => {
  await ctx.reply(
    '👥 *Manajemen Akun Creator*\n\n' +
    `Akun aktif: ${config.creatorAccounts.filter(a => a.active).length}\n` +
    `Total akun: ${config.creatorAccounts.length}\n\n` +
    'Fitur: Tambah akun, edit, remove (via admin panel web)'
  );
};

exports.handleAdminPackages = async (ctx) => {
  let text = '📦 *Manajemen Paket*\n\n';
  for (const [key, pkg] of Object.entries(config.packages)) {
    text += `${pkg.name}: ${pkg.price} Stars (${pkg.videos} video)\n`;
  }
  text += '\nEdit paket via config.js';
  await ctx.reply(text);
};

exports.handleAdminContent = async (ctx) => {
  let text = '📹 *Manajemen Konten*\n\n';
  text += '📋 Instruksi:\n';
  text += '1. Upload video ke source group\n';
  text += '2. Catat message ID\n';
  text += '3. Tambahkan ke config.packageContent\n';
  text += '4. Tidak perlu re-upload (forward-only)\n\n';
  text += 'Source Group: ' + config.sourceGroupId;
  await ctx.reply(text);
};

exports.handleAdminReport = async (ctx) => {
  const purchaseFile = './data/purchases.json';
  let purchases = {};
  try {
    purchases = JSON.parse(fs.readFileSync(purchaseFile, 'utf8'));
  } catch {}

  const totalUsers = Object.keys(purchases).length;
  const totalPurchases = Object.values(purchases).reduce((sum, arr) => sum + arr.length, 0);
  const totalRevenue = Object.values(purchases).reduce((sum, arr) => {
    return sum + arr.reduce((s, p) => s + (p.amount || 0), 0);
  }, 0);

  await ctx.reply(
    `📊 *LAPORAN PENJUALAN*\n\n` +
    `👥 Total User: ${totalUsers}\n` +
    `🛍️ Total Transaksi: ${totalPurchases}\n` +
    `💰 Total Revenue: ${totalRevenue} Stars\n\n` +
    `📈 Status: Aktif`
  );
};
