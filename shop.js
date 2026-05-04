const { InlineKeyboard } = require('grammy');
const config = require('../config');

exports.showShopMenu = async (ctx) => {
  let text = '🛒 *TOKO PREMIUM*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += 'Pilih paket yang sesuai dengan kebutuhan Anda:\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n\n';

  const keyboard = new InlineKeyboard();

  for (const [key, pkg] of Object.entries(config.packages)) {
    text += `*${pkg.name}*\n`;
    text += `${pkg.description}\n`;
    text += `💰 Harga: *${pkg.price} Stars*\n\n`;

    keyboard.text(`${pkg.name} (${pkg.price}⭐)`, `pkg_${key}`).row();
  }

  keyboard.text('← Kembali', 'back_main');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
};

exports.handlePackageSelect = async (ctx, action) => {
  const packageId = action.replace('pkg_', '');
  const pkg = config.packages[packageId];

  if (!pkg) {
    await ctx.answerCallbackQuery('❌ Paket tidak ditemukan');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('✅ Konfirmasi', `confirm_${packageId}`)
    .row()
    .text('❌ Batal', 'back_main');

  await ctx.editMessageText(
    `📦 *CHECKOUT*\n\n` +
    `Paket: *${pkg.name}*\n` +
    `Harga: *${pkg.price} Stars ⭐*\n` +
    `Video: *${pkg.videos} video*\n\n` +
    `✅ Akses seumur hidup\n` +
    `✅ Garansi channel\n` +
    `✅ Support prioritas\n\n` +
    `_Lanjutkan dengan "Konfirmasi"?_`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
};

exports.handleCheckout = async (ctx, action) => {
  const packageId = action.replace('confirm_', '');
  const pkg = config.packages[packageId];

  if (!pkg) {
    await ctx.answerCallbackQuery('❌ Paket tidak ditemukan');
    return;
  }

  const payload = `${packageId}_${Date.now()}`;

  try {
    await ctx.replyWithInvoice(
      `Paket ${pkg.name}`,
      `Dapatkan akses ke ${pkg.videos} video premium eksklusif`,
      payload,
      process.env.BOT_TOKEN,
      'XTR', // Telegram Stars currency code
      [{ label: pkg.name, amount: pkg.price }],
      {
        is_flexible: false
      }
    );
  } catch (err) {
    console.error('Invoice error:', err);
    await ctx.answerCallbackQuery('❌ Gagal membuat invoice');
  }
};
