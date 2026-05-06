const { InlineKeyboard } = require('grammy');
const config = require('../config');

// ─────────────────────────────────────────────
// Show all packages in shop menu
// ─────────────────────────────────────────────
exports.showShopMenu = async (ctx) => {
  let text = '🛒 *TOKO PREMIUM*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += 'Pilih paket yang sesuai dengan kebutuhan Anda:\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n\n';

  const keyboard = new InlineKeyboard();

  for (const [key, pkg] of Object.entries(config.packages)) {
    text += `*${pkg.name}*\n`;
    text += `${pkg.description}\n`;
    text += `💰 Harga: *${pkg.price} Stars ⭐*\n\n`;
    keyboard.text(`${pkg.name} (${pkg.price}⭐)`, `pkg_${key}`).row();
  }

  keyboard.text('← Kembali', 'back_main');

  const opts = { parse_mode: 'Markdown', reply_markup: keyboard };
  try { await ctx.editMessageText(text, opts); }
  catch { await ctx.reply(text, opts); }
};

// ─────────────────────────────────────────────
// Show checkout confirmation for selected package
// ─────────────────────────────────────────────
exports.handlePackageSelect = async (ctx, action) => {
  const packageId = action.replace('pkg_', '');
  const pkg       = config.packages[packageId];

  if (!pkg) {
    await ctx.answerCallbackQuery('❌ Paket tidak ditemukan');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('✅ Konfirmasi & Bayar', `confirm_${packageId}`).row()
    .text('❌ Batal', 'menu_shop');

  await ctx.editMessageText(
    `📦 *CHECKOUT*\n\n` +
    `Paket: *${pkg.name}*\n` +
    `Harga: *${pkg.price} Stars ⭐*\n` +
    `Video: *${pkg.videos} video*\n\n` +
    `✅ Akses seumur hidup\n` +
    `✅ Garansi channel 1x\n` +
    `✅ Support prioritas\n\n` +
    `_Tekan "Konfirmasi & Bayar" untuk melanjutkan ke pembayaran Telegram Stars._`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
};

// ─────────────────────────────────────────────
// Send Telegram Stars invoice
// ─────────────────────────────────────────────
exports.handleCheckout = async (ctx, action) => {
  const packageId = action.replace('confirm_', '');
  const pkg       = config.packages[packageId];

  if (!pkg) {
    await ctx.answerCallbackQuery('❌ Paket tidak ditemukan');
    return;
  }

  // Unique payload: packageId + timestamp prevents duplicate processing
  const payload = `${packageId}_${Date.now()}`;

  try {
    await ctx.replyWithInvoice(
      `${pkg.name}`,
      `Dapatkan akses eksklusif ke ${pkg.videos} video premium. Akses seumur hidup dengan garansi channel.`,
      payload,
      '', // provider_token must be empty string for Telegram Stars (XTR)
      'XTR',
      [{ label: pkg.name, amount: pkg.price }]
    );
  } catch (err) {
    console.error('Invoice error:', err.message);
    await ctx.answerCallbackQuery('❌ Gagal membuat invoice, coba lagi');
  }
};
