const { InlineKeyboard } = require('grammy');
const fs   = require('fs');
const path = require('path');

const accountManager = require('../services/accountManager');
const channelManager = require('../services/channelManager');
const config         = require('../config');

const warrantyFile = path.join('./data', 'warranty.json');
const pendingFile  = path.join('./data', 'pendingJoins.json');

function loadWarranty() {
  try { return JSON.parse(fs.readFileSync(warrantyFile, 'utf8')); }
  catch { return {}; }
}
function saveWarranty(data) {
  fs.writeFileSync(warrantyFile, JSON.stringify(data, null, 2));
}
function loadPending() {
  try { return JSON.parse(fs.readFileSync(pendingFile, 'utf8')); }
  catch { return {}; }
}
function savePending(data) {
  fs.writeFileSync(pendingFile, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────
// Show warranty menu
// ─────────────────────────────────────────────────────────────
exports.showWarrantyMenu = async (ctx) => {
  const userId       = ctx.from.id;
  const warranty     = loadWarranty();
  const userWarranty = warranty[userId] || [];

  let text = '🔥 *GARANSI CHANNEL*\n\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n';
  text += '✅ Garansi berlaku 1x per pembelian\n';
  text += '✅ Berlaku selama channel aktif\n';
  text += '━━━━━━━━━━━━━━━━━━━━\n\n';

  if (userWarranty.length === 0) {
    text += '❌ Anda belum memiliki pembelian.\nBeli paket dulu di menu Shop.';
  } else {
    text += '📋 *Riwayat Pembelian Anda:*\n\n';
    userWarranty.forEach((w, idx) => {
      const pkg    = config.packages[w.packageId];
      const status = w.warrantyUsed ? '✅ Garansi sudah digunakan' : '🔄 Garansi tersedia';
      text += `${idx + 1}. *${pkg?.name || w.packageId}*\n`;
      text += `   Channel: \`${w.channelId}\`\n`;
      text += `   ${status}\n\n`;
    });
  }

  const hasAvailable = userWarranty.some(w => !w.warrantyUsed);
  const keyboard = new InlineKeyboard();
  if (hasAvailable) keyboard.text('🔧 Request Garansi', 'request_warranty').row();
  keyboard.text('← Kembali', 'back_main');

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
};

// ─────────────────────────────────────────────────────────────
// Handle warranty request — real MTProto channel checks
// ─────────────────────────────────────────────────────────────
exports.handleWarrantyRequest = async (ctx) => {
  const userId       = ctx.from.id;
  const warranty     = loadWarranty();
  const userWarranty = warranty[userId] || [];

  const eligible = userWarranty.find(w => !w.warrantyUsed);

  if (!eligible) {
    await ctx.answerCallbackQuery('❌ Tidak ada garansi tersedia');
    return;
  }

  // Mark as used immediately so user can't spam
  eligible.warrantyUsed      = true;
  eligible.warrantyCheckDate = Date.now();
  saveWarranty(warranty);

  const statusMsg = await ctx.reply(
    '⏳ *Memverifikasi Channel...*\n\n' +
    '🔍 Mengecek status channel\n' +
    '🔍 Mengecek akses pengguna\n' +
    '🔍 Validasi server Telegram\n\n' +
    'Mohon tunggu...',
    { parse_mode: 'Markdown' }
  );

  // Run real checks in background
  _runWarrantyCheck(ctx.api, userId, eligible, statusMsg.message_id, warranty);
};

// ─────────────────────────────────────────────────────────────
// Internal — perform real warranty checks
// ─────────────────────────────────────────────────────────────
async function _runWarrantyCheck(api, userId, warrantyEntry, msgId, fullWarranty) {
  try {
    const account = accountManager.getAccountById(warrantyEntry.accountId)
                 || await accountManager.getAvailableAccount();

    if (!account) throw new Error('Tidak ada akun creator tersedia untuk cek garansi');

    const channelId = warrantyEntry.channelId;

    // ── Real Check 1: is channel still up? ──────────────────
    const channelOk = await channelManager.checkChannelAccessible(account, channelId);

    // ── Real Check 2: is user still in channel? ─────────────
    const userInChannel = channelOk
      ? await channelManager.checkUserInChannel(account, channelId, userId)
      : false;

    // ── Decision ─────────────────────────────────────────────
    if (channelOk && userInChannel) {
      // Everything fine — no action needed
      await api.editMessageText(
        userId, msgId,
        '✅ *Garansi Diperiksa — Channel Aman*\n\n' +
        'Channel Anda dalam kondisi baik dan akses masih aktif.\n\n' +
        '✨ Tidak diperlukan tindakan lebih lanjut.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Channel blocked OR user has left — recreate channel
    const reason = !channelOk
      ? '⚠️ *Channel Terblokir Terdeteksi*'
      : '⚠️ *Akses Channel Terputus*';

    await api.editMessageText(
      userId, msgId,
      `${reason}\n\n` +
      '🔄 Sedang membuat channel pengganti...\n' +
      '⏳ Proses memakan waktu 1–2 menit.',
      { parse_mode: 'Markdown' }
    );

    await _recreateChannel(api, userId, warrantyEntry, msgId, fullWarranty);

  } catch (err) {
    console.error('Warranty check error:', err.message);
    await api.editMessageText(
      userId, msgId,
      `❌ *Gagal Memeriksa Garansi*\n\nError: ${err.message}\n\nHubungi support.`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Internal — recreate channel same as original purchase flow
// ─────────────────────────────────────────────────────────────
async function _recreateChannel(api, userId, warrantyEntry, msgId, fullWarranty) {
  try {
    const pkg     = config.packages[warrantyEntry.packageId];
    const account = await accountManager.getAvailableAccount();

    if (!account) throw new Error('Tidak ada akun creator tersedia');

    // Step 1: New channel
    await api.editMessageText(userId, msgId,
      '🔄 *Membuat Channel Baru...*\n\n📋 Fase 1/3 — Membuat channel private...',
      { parse_mode: 'Markdown' }
    );

    const newChannelId = await channelManager.createPrivateChannel(
      account,
      `📺 ${pkg.name} — ${userId} (Garansi)`
    );

    // Step 2: Add bot as admin
    const botInfo = await api.getMe();
    await channelManager.addBotAsAdmin(account, newChannelId, botInfo.id);

    // Step 3: Fill with content
    const messageIds = config.packageContent[warrantyEntry.packageId] || [];
    for (let i = 0; i < messageIds.length; i++) {
      await channelManager.forwardVideoToChannel(
        account,
        config.sourceGroupId,
        messageIds[i],
        newChannelId
      );
    }

    await api.editMessageText(userId, msgId,
      '🔄 *Membuat Channel Baru...*\n\n📋 Fase 2/3 — Konten video dikirim...',
      { parse_mode: 'Markdown' }
    );

    // Step 4: Create new join-request invite link
    const newInviteLink = await channelManager.createJoinRequestLink(account, newChannelId);

    // Register new pending join
    const pending = loadPending();
    const normId  = Math.abs(Number(newChannelId));
    pending[normId] = {
      authorizedUserId: userId,
      inviteLink: newInviteLink,
      accountId: account.id,
      packageId: warrantyEntry.packageId,
      createdAt: Date.now()
    };
    savePending(pending);

    // Creator leaves
    await channelManager.creatorLeavesChannel(account, newChannelId);

    // Update warranty entry with new channel
    warrantyEntry.channelId        = newChannelId;
    warrantyEntry.replacedChannelId = warrantyEntry.channelId;
    warrantyEntry.accountId        = account.id;
    saveWarranty(fullWarranty);

    await api.editMessageText(
      userId, msgId,
      '✅ *Channel Baru Siap!*\n\n' +
      `📦 Paket: *${pkg.name}*\n` +
      `📹 Video: *${messageIds.length} video*\n\n` +
      `🔗 *Link Akses Baru (Sekali Pakai):*\n${newInviteLink}\n\n` +
      `📝 *Cara Masuk:*\n` +
      `1. Klik link di atas\n` +
      `2. Tekan "Request to Join"\n` +
      `3. Tunggu persetujuan otomatis\n` +
      `4. Link akan dinonaktifkan setelah Anda masuk\n\n` +
      `⚠️ _Garansi ini berlaku 1x. Jaga akses Anda baik-baik._`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );

  } catch (err) {
    console.error('Recreate channel error:', err.message);
    await api.editMessageText(
      userId, msgId,
      `❌ *Gagal Membuat Channel Baru*\n\nError: ${err.message}\n\nHubungi support.`,
      { parse_mode: 'Markdown' }
    );
  }
}
