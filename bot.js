const { Bot, InlineKeyboard } = require('grammy');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const accountManager = require('./services/accountManager');
const channelManager = require('./services/channelManager');
const shopHandler    = require('./handlers/shop');
const warrantyHandler = require('./handlers/warranty');
const adminHandler   = require('./handlers/admin');
const loginHandler   = require('./handlers/loginHandler');
const config         = require('./config');

const bot = new Bot(process.env.BOT_TOKEN);

const dataDir = './data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// ═══════════════════════════════════════════════════════════════
// DATA PERSISTENCE
// ═══════════════════════════════════════════════════════════════
const purchaseFile = path.join(dataDir, 'purchases.json');
const warrantyFile = path.join(dataDir, 'warranty.json');
const pendingFile  = path.join(dataDir, 'pendingJoins.json');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const loadPurchases = () => loadJSON(purchaseFile);
const savePurchases = (d) => saveJSON(purchaseFile, d);
const loadWarranty  = () => loadJSON(warrantyFile);
const saveWarranty  = (d) => saveJSON(warrantyFile, d);
const loadPending   = () => loadJSON(pendingFile);
const savePending   = (d) => saveJSON(pendingFile, d);

// ═══════════════════════════════════════════════════════════════
// SESSION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
const { session } = require('grammy');
bot.use(session({ initial: () => ({}) }));

bot.use(async (ctx, next) => {
  ctx.purchases = loadPurchases();
  ctx.warranty  = loadWarranty();
  await next();
});

// ═══════════════════════════════════════════════════════════════
// MAIN MENU
// ═══════════════════════════════════════════════════════════════
const mainMenu = new InlineKeyboard()
  .text('🛒 Shop 🛒', 'menu_shop')
  .text('🔥 Garansi 🔥', 'menu_warranty')
  .row()
  .text('💬 Support 💬', 'menu_support')
  .text('🔔 Aturan 🔔', 'menu_rules');

bot.command('start', async (ctx) => {
  const userName = ctx.from.first_name || 'User';
  await ctx.reply(
    `👋 *Selamat datang, ${userName}!*\n\n` +
    `🎉 Dapatkan akses eksklusif ke konten premium kami.`,
    { parse_mode: 'Markdown', reply_markup: mainMenu }
  );
});

// ═══════════════════════════════════════════════════════════════
// REGISTER LOGIN HANDLER (callbacks: admin_add_account, creator_login_cancel)
// ═══════════════════════════════════════════════════════════════
loginHandler(bot);

// ═══════════════════════════════════════════════════════════════
// INPUT HANDLER — contact + text
// Urutan penting:
//   1. loginHandler.handleInput dicoba dulu (hanya untuk admin)
//   2. Jika tidak dikonsumsi, lanjut ke handler lain
// ═══════════════════════════════════════════════════════════════
bot.on('message:contact', async (ctx, next) => {
  // Contact bisa untuk login creator account (act: creator_phone)
  const consumed = await loginHandler.handleInput(ctx);
  if (!consumed) return next();
});

bot.on('message:text', async (ctx, next) => {
  // Coba loginHandler dulu (hanya memproses jika admin + session.act = creator_*)
  const consumed = await loginHandler.handleInput(ctx);
  if (!consumed) return next();
});

// ═══════════════════════════════════════════════════════════════
// PAYMENT
// ═══════════════════════════════════════════════════════════════
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const userId  = ctx.from.id;
  const payment = ctx.message.successful_payment;
  const [packageId] = payment.invoice_payload.split('_');
  const pkg = config.packages[packageId];

  if (!pkg) { await ctx.reply('❌ Paket tidak ditemukan.'); return; }

  const purchaseRecord = {
    userId, packageId,
    amount: payment.total_amount,
    currency: payment.currency,
    timestamp: Date.now(),
    status: 'processing',
    channelId: null, inviteLink: null, accountId: null
  };

  let purchases = loadPurchases();
  if (!purchases[userId]) purchases[userId] = [];
  purchases[userId].push(purchaseRecord);
  savePurchases(purchases);

  const progressMsg = await ctx.reply(
    _buildProgressText(1, 0, 'Memulai proses...'),
    { parse_mode: 'Markdown' }
  );

  _handlePurchaseAsync(ctx.api, userId, packageId, purchaseRecord, progressMsg.message_id);
});

// ═══════════════════════════════════════════════════════════════
// JOIN REQUEST — approve hanya pembeli, decline yang lain
// ═══════════════════════════════════════════════════════════════
bot.on('chat_join_request', async (ctx) => {
  const requestUserId = ctx.chatJoinRequest.from.id;
  const chatId        = ctx.chatJoinRequest.chat.id;
  const normChatId    = Math.abs(chatId);

  const pending = loadPending();
  const entry   = pending[normChatId] || pending[String(chatId)];

  if (!entry) {
    try { await ctx.api.declineChatJoinRequest(chatId, requestUserId); } catch {}
    return;
  }

  if (String(requestUserId) === String(entry.authorizedUserId)) {
    try {
      await ctx.api.approveChatJoinRequest(chatId, requestUserId);

      const account = accountManager.getAccountById(entry.accountId);
      if (account && entry.inviteLink)
        await channelManager.revokeInviteLink(account, chatId, entry.inviteLink);

      delete pending[normChatId];
      delete pending[String(chatId)];
      savePending(pending);

      await ctx.api.sendMessage(
        requestUserId,
        '✅ *Akses Disetujui!*\n\nSelamat menikmati konten premium.\n🔒 Link telah dinonaktifkan.',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Approve join error:', err.message);
    }
  } else {
    try { await ctx.api.declineChatJoinRequest(chatId, requestUserId); } catch {}
  }
});

// ═══════════════════════════════════════════════════════════════
// CALLBACK ROUTER
// ═══════════════════════════════════════════════════════════════
bot.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;

  if      (action === 'menu_shop')     await shopHandler.showShopMenu(ctx);
  else if (action === 'menu_warranty') await warrantyHandler.showWarrantyMenu(ctx);
  else if (action === 'menu_support') {
    await ctx.editMessageText(
      '💬 *Support Center*\n\nHubungi: @support_channel\nResponse time: 1-2 jam',
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('← Kembali', 'back_main') }
    );
  } else if (action === 'menu_rules') {
    await ctx.editMessageText(
      '🔔 *Aturan & Ketentuan*\n\n' +
      '1️⃣ Akun pribadi, tidak boleh dibagikan\n' +
      '2️⃣ Garansi berlaku 1x per pembelian\n' +
      '3️⃣ Channel bersifat seumur hidup\n' +
      '4️⃣ Refund tidak tersedia',
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('← Kembali', 'back_main') }
    );
  } else if (action === 'back_main' || action === 'admin_back') {
    if (action === 'admin_back') {
      await adminHandler.showAdminMenu(ctx);
    } else {
      await ctx.editMessageText(
        '👋 *Menu Utama*\n\n🎉 Pilih layanan yang Anda inginkan.',
        { parse_mode: 'Markdown', reply_markup: mainMenu }
      );
    }
  } else if (action.startsWith('pkg_'))           await shopHandler.handlePackageSelect(ctx, action);
  else if (action.startsWith('confirm_'))          await shopHandler.handleCheckout(ctx, action);
  else if (action === 'request_warranty')          await warrantyHandler.handleWarrantyRequest(ctx);
  else if (action.startsWith('admin_'))            await adminHandler.handleAdminAction(ctx, action);
  // creator_login_cancel ditangani oleh loginHandler

  try { await ctx.answerCallbackQuery(); } catch {}
});

// ═══════════════════════════════════════════════════════════════
// ADMIN COMMAND
// ═══════════════════════════════════════════════════════════════
bot.command('admin', async (ctx) => {
  if (String(ctx.from.id) !== String(process.env.ADMIN_ID)) {
    return ctx.reply('❌ Unauthorized');
  }
  await adminHandler.showAdminMenu(ctx);
});

// ═══════════════════════════════════════════════════════════════
// PURCHASE PROCESSING
// ═══════════════════════════════════════════════════════════════
async function _handlePurchaseAsync(api, userId, packageId, record, progressMsgId) {
  try {
    const pkg = config.packages[packageId];

    await _updateProgress(api, userId, progressMsgId, 1, 10, 'Memilih akun creator...');
    const account = await accountManager.getAvailableAccount();
    record.accountId = account.id;

    await _updateProgress(api, userId, progressMsgId, 1, 25, 'Membuat channel private...');
    const channelId = await channelManager.createPrivateChannel(account, `📺 ${pkg.name} — ${userId}`);
    record.channelId = channelId;

    await _updateProgress(api, userId, progressMsgId, 1, 40, 'Mengatur admin channel...');
    const botInfo = await api.getMe();
    await channelManager.addBotAsAdmin(account, channelId, botInfo.id);

    await _updateProgress(api, userId, progressMsgId, 2, 50, 'Mengisi konten video...');
    const messageIds = config.packageContent[packageId] || [];
    for (let i = 0; i < messageIds.length; i++) {
      await channelManager.forwardVideoToChannel(account, config.sourceGroupId, messageIds[i], channelId);
      const pct = 50 + ((i + 1) / messageIds.length) * 30;
      await _updateProgress(api, userId, progressMsgId, 2, pct, `Video ${i + 1}/${messageIds.length}...`);
    }

    await _updateProgress(api, userId, progressMsgId, 3, 85, 'Membuat link akses...');
    const inviteLink = await channelManager.createJoinRequestLink(account, channelId);
    record.inviteLink = inviteLink;

    const pending = loadPending();
    pending[Math.abs(Number(channelId))] = {
      authorizedUserId: userId, inviteLink,
      accountId: account.id, packageId, createdAt: Date.now()
    };
    savePending(pending);

    await channelManager.creatorLeavesChannel(account, channelId);
    await _updateProgress(api, userId, progressMsgId, 3, 100, 'Selesai!');

    record.status      = 'completed';
    record.completedAt = Date.now();
    _savePurchaseRecord(userId, record);
    _recordWarranty(userId, record);

    await api.editMessageText(userId, progressMsgId,
      `✅ *Channel Siap!*\n\n📦 Paket: *${pkg.name}*\n📹 Video: *${messageIds.length} video*\n\n` +
      `🔗 *Link Akses (Sekali Pakai):*\n${inviteLink}\n\n` +
      `📝 Klik → Request to Join → Tunggu persetujuan otomatis`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  } catch (err) {
    console.error('Purchase error:', err.message);
    record.status = 'failed';
    record.error  = err.message;
    _savePurchaseRecord(userId, record);
    if (err.message?.includes('CHANNELS_TOO_MUCH') && record.accountId)
      accountManager.markAccountLimited(record.accountId);
    await api.editMessageText(userId, progressMsgId,
      `❌ *Gagal*\n\n${err.message}\n\nHubungi support.`,
      { parse_mode: 'Markdown' }
    );
  }
}

function _buildProgressText(phase, percent, text) {
  const filled = Math.min(20, Math.floor(percent / 5));
  const bar    = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return (
    `⏳ *Fase ${phase} — ${text}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${bar} ${Math.floor(percent)}%\n` +
    `📋 Diproses : ${phase} / 3 fase\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\nMohon menunggu...`
  );
}

async function _updateProgress(api, userId, msgId, phase, percent, text) {
  try {
    await api.editMessageText(userId, msgId, _buildProgressText(phase, percent, text), { parse_mode: 'Markdown' });
  } catch {}
}

function _savePurchaseRecord(userId, record) {
  const purchases = loadPurchases();
  if (!purchases[userId]) purchases[userId] = [];
  const idx = purchases[userId].findIndex(p => p.timestamp === record.timestamp);
  if (idx !== -1) purchases[userId][idx] = record;
  else purchases[userId].push(record);
  savePurchases(purchases);
}

function _recordWarranty(userId, record) {
  const warranty = loadWarranty();
  if (!warranty[userId]) warranty[userId] = [];
  warranty[userId].push({
    purchaseTimestamp: record.timestamp, channelId: record.channelId,
    packageId: record.packageId, accountId: record.accountId,
    warrantyUsed: false, warrantyCheckDate: null
  });
  saveWarranty(warranty);
}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
accountManager.initialize();
channelManager.initialize();

bot.catch(err => console.error('[BOT_ERROR]', err));
bot.start({
  allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'chat_join_request']
});
console.log('🤖 Bot started...');
