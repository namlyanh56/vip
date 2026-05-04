const { Bot, InlineKeyboard, Keyboard } = require('grammy');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const accountManager = require('./services/accountManager');
const channelManager = require('./services/channelManager');
const shopHandler = require('./handlers/shop');
const warrantyHandler = require('./handlers/warranty');
const adminHandler = require('./handlers/admin');
const config = require('./config');

const bot = new Bot(process.env.BOT_TOKEN);
const dataDir = './data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// ═══════════════════════════════════════════════════════════════
// DATA PERSISTENCE
// ═══════════════════════════════════════════════════════════════
const purchaseFile = path.join(dataDir, 'purchases.json');
const warrantyFile = path.join(dataDir, 'warranty.json');

function loadPurchases() {
  try {
    return JSON.parse(fs.readFileSync(purchaseFile, 'utf8'));
  } catch {
    return {};
  }
}

function savePurchases(data) {
  fs.writeFileSync(purchaseFile, JSON.stringify(data, null, 2));
}

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

// ═══════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════
bot.use(async (ctx, next) => {
  ctx.purchases = loadPurchases();
  ctx.warranty = loadWarranty();
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
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'User';
  
  await ctx.reply(
    `👋 *Selamat datang, ${userName}!*\n\n` +
    `🎉 Dapatkan akses eksklusif ke konten premium kami.\n` +
    `Pilih paket yang sesuai dan nikmati unlimited streaming!`,
    { 
      parse_mode: 'Markdown',
      reply_markup: mainMenu
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// PAYMENT HANDLER (Telegram Stars)
// ═══════════════════════════════════════════════════════════════
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const payment = ctx.message.successful_payment;
  const invoicePayload = payment.invoice_payload;
  
  try {
    const [packageId, randomId] = invoicePayload.split('_');
    const pkg = config.packages[packageId];
    
    if (!pkg) {
      await ctx.reply('❌ Paket tidak ditemukan.');
      return;
    }

    // Update purchases
    let purchases = loadPurchases();
    if (!purchases[userId]) purchases[userId] = [];
    
    const purchaseRecord = {
      userId,
      packageId,
      amount: payment.total_amount / 100,
      currency: payment.currency,
      timestamp: Date.now(),
      status: 'processing',
      channelId: null,
      inviteLink: null
    };
    
    purchases[userId].push(purchaseRecord);
    savePurchases(purchases);

    // Show progress
    const progressMsg = await ctx.reply(
      '⏳ *Fase 1 — Pembuatan Channel*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      '░░░░░░░░░░░░░░░░░░░░ 0%\n' +
      '📋 Diproses : 0 / 3 fase\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Mohon menunggu hingga channel siap...',
      { parse_mode: 'Markdown' }
    );

    // Process in background
    handlePurchaseAsync(ctx.api, userId, packageId, purchaseRecord, progressMsg.message_id);
    
  } catch (err) {
    console.error('Payment error:', err);
    await ctx.reply('❌ Terjadi kesalahan. Hubungi support.');
  }
});

async function handlePurchaseAsync(api, userId, packageId, purchaseRecord, progressMsgId) {
  try {
    const pkg = config.packages[packageId];
    
    // Phase 1: Create channel
    await updateProgress(api, userId, progressMsgId, 1, 30, 'Membuat channel...');
    
    const account = await accountManager.getAvailableAccount();
    if (!account) throw new Error('Tidak ada akun creator tersedia');

    const channelId = await channelManager.createPrivateChannel(
      account,
      `📺 ${pkg.name} - ${userId}`
    );

    purchaseRecord.channelId = channelId;

    // Phase 2: Fill videos
    await updateProgress(api, userId, progressMsgId, 2, 60, 'Mengisi konten...');
    
    const sourceMessages = config.packageContent[packageId] || [];
    if (sourceMessages.length > 0) {
      for (let i = 0; i < sourceMessages.length; i++) {
        const msgId = sourceMessages[i];
        await channelManager.forwardVideoToChannel(
          account,
          config.sourceGroupId,
          msgId,
          channelId
        );
        
        const percent = 60 + ((i + 1) / sourceMessages.length) * 30;
        await updateProgress(api, userId, progressMsgId, 2, percent, 'Mengisi konten...');
      }
    }

    // Phase 3: Create invite & send
    await updateProgress(api, userId, progressMsgId, 3, 90, 'Membuat link akses...');
    
    const inviteLink = await channelManager.createJoinRequestLink(account, channelId);
    purchaseRecord.inviteLink = inviteLink;
    purchaseRecord.status = 'completed';
    purchaseRecord.completedAt = Date.now();

    // Bot leaves channel
    await channelManager.botLeavesChannel(account, channelId);

    // Final update
    await updateProgress(api, userId, progressMsgId, 3, 100, 'Selesai!');

    // Save updated purchase
    let purchases = loadPurchases();
    const existingIdx = purchases[userId].findIndex(p => p.timestamp === purchaseRecord.timestamp);
    if (existingIdx !== -1) purchases[userId][existingIdx] = purchaseRecord;
    savePurchases(purchases);

    // Send final message with link
    await api.editMessageText(
      userId,
      progressMsgId,
      `✅ *Channel Siap!*\n\n` +
      `Paket: *${pkg.name}*\n` +
      `Status: Aktif\n\n` +
      `🔗 *Link Akses (Sekali Pakai):*\n` +
      `${inviteLink}\n\n` +
      `📝 *Petunjuk:*\n` +
      `1. Klik link di atas\n` +
      `2. Request join ke channel\n` +
      `3. Tunggu approval (otomatis)\n` +
      `4. Link akan otomatis di-disable setelah akses`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );

    // Save for warranty check
    await recordWarrantyEligibility(userId, purchaseRecord);

  } catch (err) {
    console.error('Purchase processing error:', err);
    purchaseRecord.status = 'failed';
    purchaseRecord.error = err.message;

    let purchases = loadPurchases();
    const existingIdx = purchases[userId].findIndex(p => p.timestamp === purchaseRecord.timestamp);
    if (existingIdx !== -1) purchases[userId][existingIdx] = purchaseRecord;
    savePurchases(purchases);

    await api.editMessageText(
      userId,
      progressMsgId,
      `❌ *Gagal Membuat Channel*\n\n` +
      `Error: ${err.message}\n\n` +
      `Silakan hubungi support atau coba lagi.`,
      { parse_mode: 'Markdown' }
    );
  }
}

async function updateProgress(api, userId, msgId, phase, percent, text) {
  const filled = Math.floor(percent / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  await api.editMessageText(
    userId,
    msgId,
    `⏳ *Fase ${phase} — ${text}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${bar} ${Math.floor(percent)}%\n` +
    `📋 Diproses : ${phase} / 3 fase\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Mohon menunggu hingga channel siap...`,
    { parse_mode: 'Markdown' }
  );
}

async function recordWarrantyEligibility(userId, purchaseRecord) {
  let warranty = loadWarranty();
  if (!warranty[userId]) warranty[userId] = [];
  
  warranty[userId].push({
    purchaseTimestamp: purchaseRecord.timestamp,
    channelId: purchaseRecord.channelId,
    packageId: purchaseRecord.packageId,
    warrantyUsed: false,
    warrantyCheckDate: null
  });
  
  saveWarranty(warranty);
}

// ═══════════════════════════════════════════════════════════════
// CALLBACK HANDLERS
// ═══════════════════════════════════════════════════════════════
bot.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;

  if (action === 'menu_shop') {
    await shopHandler.showShopMenu(ctx);
  } else if (action === 'menu_warranty') {
    await warrantyHandler.showWarrantyMenu(ctx);
  } else if (action === 'menu_support') {
    await ctx.editMessageText(
      '💬 *Support Center*\n\n' +
      'Hubungi: @support_channel\n' +
      'Email: support@example.com\n' +
      'Response time: 1-2 jam',
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('← Kembali', 'back_main') }
    );
  } else if (action === 'menu_rules') {
    await ctx.editMessageText(
      '🔔 *Aturan & Ketentuan*\n\n' +
      '1️⃣ Akun pribadi, tidak boleh dibagikan\n' +
      '2️⃣ Garansi berlaku 1x per pembelian\n' +
      '3️⃣ Channel bersifat seumur hidup (selama tidak terblokir)\n' +
      '4️⃣ Support tersedia 24/7\n' +
      '5️⃣ Refund tidak tersedia',
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('← Kembali', 'back_main') }
    );
  } else if (action === 'back_main') {
    await ctx.editMessageText(
      '👋 *Menu Utama*\n\n' +
      '🎉 Pilih layanan yang Anda inginkan.',
      { parse_mode: 'Markdown', reply_markup: mainMenu }
    );
  } else if (action.startsWith('pkg_')) {
    await shopHandler.handlePackageSelect(ctx, action);
  } else if (action.startsWith('confirm_')) {
    await shopHandler.handleCheckout(ctx, action);
  } else if (action === 'request_warranty') {
    await warrantyHandler.handleWarrantyRequest(ctx);
  }

  await ctx.answerCallbackQuery();
});

// ═══════════════════════════════════════════════════════════════
// ADMIN COMMANDS
// ═══════════════════════════════════════════════════════════════
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== parseInt(process.env.ADMIN_ID)) {
    return ctx.reply('❌ Unauthorized');
  }
  
  await adminHandler.showAdminMenu(ctx);
});

// Initialize services
accountManager.initialize();
channelManager.initialize();

bot.catch(err => console.error('Bot error:', err));
bot.start();
console.log('🤖 Bot started...');
