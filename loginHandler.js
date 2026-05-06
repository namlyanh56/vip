/**
 * loginHandler.js
 * Flow login creator account via Telegram bot.
 * Diadaptasi dari pola auth.js + input.js referensi.
 *
 * State session (ctx.session) yang digunakan:
 *   { act: 'creator_apiid'  }           — menunggu API ID
 *   { act: 'creator_apihash' }          — menunggu API Hash
 *   { act: 'creator_phone'  }           — menunggu nomor HP
 *   { act: 'creator_otp',   sid: <id> } — menunggu OTP / password (login berjalan)
 */

const { Keyboard, InlineKeyboard } = require('grammy');
const accountManager = require('../services/accountManager');
const CreatorSession = require('../services/CreatorSession');
const { saveState }  = require('../utils/persist'); // atau path sesuai project

// ── In-memory map: adminId → CreatorSession yang sedang login ──
// (Tidak perlu persist karena login bersifat real-time)
const pendingLogins = new Map();

// ─────────────────────────────────────────────────────────────
// Registrasi handler ke bot
// ─────────────────────────────────────────────────────────────
module.exports = (bot) => {

  // ── Mulai login baru (dipanggil dari admin panel) ────────
  bot.callbackQuery('admin_add_account', async (ctx) => {
    const adminId = ctx.from.id;
    if (String(adminId) !== String(process.env.ADMIN_ID)) {
      return ctx.answerCallbackQuery('❌ Unauthorized');
    }

    // Buat session baru
    const sess = new CreatorSession();
    pendingLogins.set(adminId, sess);

    ctx.session = { act: 'creator_apiid' };
    await ctx.answerCallbackQuery();

    await ctx.reply(
      '➕ *Tambah Akun Creator*\n\n' +
      'Langkah 1/4 — Masukkan *API ID* akun Telegram ini.\n' +
      '_Dapatkan dari https://my.telegram.org → App API_',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('Batal', 'creator_login_cancel')
      }
    );
  });

  // ── Batal via inline button ──────────────────────────────
  bot.callbackQuery('creator_login_cancel', async (ctx) => {
    const adminId = ctx.from.id;
    _cancelLogin(adminId, ctx);
    ctx.session = null;
    await ctx.answerCallbackQuery('❌ Login dibatalkan');
    await ctx.reply('❌ Proses login akun creator dibatalkan.');
  });
};

// ─────────────────────────────────────────────────────────────
// Input handler — dipanggil dari bot.on('message:text') di bot.js
// Mengembalikan true jika pesan ini dikonsumsi oleh login flow
// ─────────────────────────────────────────────────────────────
module.exports.handleInput = async (ctx) => {
  const adminId = ctx.from.id;
  if (String(adminId) !== String(process.env.ADMIN_ID)) return false;

  const act  = ctx.session?.act;
  const text = ctx.message?.text?.trim() || '';

  if (!act || !act.startsWith('creator_')) return false;

  // ── creator_otp: OTP / password sudah ditangani oleh CreatorSession.handleText
  if (act === 'creator_otp') {
    const sess = pendingLogins.get(adminId);
    if (!sess) {
      // FIX: bot restart saat menunggu OTP — recovery
      ctx.session = null;
      await ctx.reply(
        '⚠️ *Proses login terputus* (kemungkinan bot restart).\n\n' +
        'Silakan mulai ulang dari panel Admin → Tambah Akun Creator.',
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    // FIX: jika loginInFlight sudah selesai (sukses/gagal), abaikan
    if (!sess._loginInFlight) return false;

    // Teruskan teks ke session (resolve pendingCode / pendingPass / queue OTP)
    sess.handleText(text);
    return true;
  }

  // ── Langkah-langkah pengisian data sebelum login ─────────

  if (act === 'creator_apiid') {
    const val = parseInt(text, 10);
    if (!Number.isFinite(val) || val < 1) {
      await ctx.reply('❌ API ID harus berupa angka positif.\nContoh: 12345678');
      return true;
    }
    const sess = pendingLogins.get(adminId) || new CreatorSession();
    sess.apiId = val;
    pendingLogins.set(adminId, sess);
    ctx.session = { act: 'creator_apihash' };
    await ctx.reply(
      '✅ API ID tersimpan.\n\n' +
      'Langkah 2/4 — Masukkan *API Hash* akun ini:',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('Batal', 'creator_login_cancel')
      }
    );
    return true;
  }

  if (act === 'creator_apihash') {
    if (!/^[a-f0-9]{32}$/i.test(text)) {
      await ctx.reply('❌ API Hash tidak valid (harus 32 karakter hex).\nContoh: abcdef1234567890abcdef1234567890');
      return true;
    }
    const sess = pendingLogins.get(adminId);
    if (!sess) { ctx.session = null; return true; }
    sess.apiHash = text;
    ctx.session = { act: 'creator_phone' };

    const kb = new Keyboard().requestContact('📂 Kirim nomor').text('Batal').resized();
    await ctx.reply(
      '✅ API Hash tersimpan.\n\n' +
      'Langkah 3/4 — Kirim *nomor telepon* akun Telegram ini\n' +
      '_(gunakan tombol di bawah atau ketik manual, contoh: +628xxx)_',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return true;
  }

  if (act === 'creator_phone') {
    // Bisa dari contact atau teks manual
    const contact = ctx.message?.contact?.phone_number || '';
    const raw     = contact || text;
    const phone   = _normalizePhone(raw);

    if (!/^\+\d{8,15}$/.test(phone)) {
      await ctx.reply('❌ Nomor tidak valid.\nContoh: +6281234567890 atau 081234567890');
      return true;
    }

    const sess = pendingLogins.get(adminId);
    if (!sess) { ctx.session = null; return true; }

    // FIX: set session ke creator_otp SEBELUM login async dimulai
    // sehingga recovery bekerja jika bot restart
    ctx.session = { act: 'creator_otp' };

    try { await ctx.reply('⏳ Menginisialisasi login, mohon tunggu...'); } catch {}

    // Jalankan login async — tidak di-await agar bot tetap responsif
    sess.login(ctx, adminId, phone)
      .then(async (sessionString) => {
        // Simpan akun baru ke accountManager
        const newAccount = accountManager.addAccount({
          apiId:         sess.apiId,
          apiHash:       sess.apiHash,
          phoneNumber:   phone,
          sessionString,
          name:          sess.name,
          active:        true,
          limitReached:  false
        });

        pendingLogins.delete(adminId);
        ctx.session = null;

        await ctx.api.sendMessage(
          adminId,
          `✅ *Akun Creator Berhasil Ditambahkan!*\n\n` +
          `👤 Nama: *${sess.name}*\n` +
          `📱 Nomor: ${phone}\n` +
          `🆔 ID Akun: ${newAccount.id}\n\n` +
          `Akun siap digunakan untuk membuat channel.`,
          { parse_mode: 'Markdown' }
        );
      })
      .catch(async (err) => {
        pendingLogins.delete(adminId);
        ctx.session = null;
        await ctx.api.sendMessage(
          adminId,
          `❌ *Login Gagal*\n\nError: ${err.message}\n\nSilakan coba lagi dari panel Admin.`,
          { parse_mode: 'Markdown' }
        );
      });

    return true;
  }

  return false;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function _cancelLogin(adminId, ctx) {
  const sess = pendingLogins.get(adminId);
  if (sess) {
    try { sess.cancel(ctx, adminId); } catch {}
    pendingLogins.delete(adminId);
  }
}

function _normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  if (/^0\d+/.test(s)) s = '+62' + s.slice(1);
  if (/^\d{8,15}$/.test(s)) s = '+' + s;
  return s;
}
