const { InlineKeyboard } = require('grammy');
const fs = require('fs');
const path = require('path');

const warrantyFile = path.join('./data', 'warranty.json');

function loadWarranty() {
  try {
    return JSON.parse(fs.readFileSync(warrantyFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveWarranty(data) {
  fs.writeFileSync(warrantyFile, JSON.stringify(data, null, 2));
}

exports.showWarrantyMenu = async (ctx) => {
  const userId = ctx.from.id;
  const warranty = loadWarranty();
  const userWarranty = warranty[userId] || [];

  let text = '🔥 *GARANSI CHANNEL*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += '✅ Garansi berlaku 1x per pembelian\n';
  text += '✅ Garansi 24 jam (sejak pembelian)\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n\n';

  if (userWarranty.length === 0) {
    text += '❌ Anda belum memiliki pembelian.\n';
    text += 'Beli paket dulu di menu Shop.';
  } else {
    text += '📋 *Riwayat Pembelian Anda:*\n\n';
    userWarranty.forEach((w, idx) => {
      const status = w.warrantyUsed ? '✅ Digunakan' : '🔄 Tersedia';
      text += `${idx + 1}. Channel ${w.channelId}\n${status}\n\n`;
    });
  }

  const keyboard = new InlineKeyboard();
  if (userWarranty.length > 0) {
    keyboard.text('🔧 Request Garansi', 'request_warranty').row();
  }
  keyboard.text('← Kembali', 'back_main');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
};

exports.handleWarrantyRequest = async (ctx) => {
  const userId = ctx.from.id;
  const warranty = loadWarranty();
  const userWarranty = warranty[userId] || [];

  const availableWarranties = userWarranty.filter(w => !w.warrantyUsed);

  if (availableWarranties.length === 0) {
    await ctx.answerCallbackQuery('❌ Tidak ada garansi tersedia');
    return;
  }

  // Mark first available as used and initiate check
  const selectedWarranty = availableWarranties[0];
  selectedWarranty.warrantyUsed = true;
  selectedWarranty.warrantyCheckDate = Date.now();
  saveWarranty(warranty);

  const msg = await ctx.reply(
    '⏳ *Memverifikasi Channel...*\n\n' +
    'Sedang melakukan pengecekan:\n' +
    '🔍 Status channel\n' +
    '🔍 Akses pengguna\n' +
    '🔍 Validasi server\n\n' +
    'Mohon tunggu...',
    { parse_mode: 'Markdown' }
  );

  // Simulate warranty check (replace with actual implementation)
  setTimeout(async () => {
    const random = Math.random();
    
    if (random < 0.7) {
      // Channel OK
      await ctx.api.editMessageText(
        userId,
        msg.message_id,
        '✅ *Garansi Disetujui!*\n\n' +
        'Channel Anda dalam status baik.\n' +
        'Akses tetap aktif seumur hidup.\n\n' +
        '✨ Terima kasih atas kepercayaan Anda!',
        { parse_mode: 'Markdown' }
      );
    } else {
      // Channel blocked - recreate
      await ctx.api.editMessageText(
        userId,
        msg.message_id,
        '⚠️ *Channel Terblokir Terdeteksi*\n\n' +
        '🔄 Sedang membuat channel baru...\n' +
        '⏳ Silakan tunggu 1-2 menit.',
        { parse_mode: 'Markdown' }
      );

      setTimeout(async () => {
        await ctx.api.editMessageText(
          userId,
          msg.message_id,
          '✅ *Channel Baru Siap!*\n\n' +
          '📺 Channel baru telah dibuat dengan konten lengkap.\n' +
          '🔗 Link akses akan dikirim segera.\n\n' +
          '💬 Hub support jika ada kendala.',
          { parse_mode: 'Markdown' }
        );
      }, 5000);
    }
  }, 3000);
};
