const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');

function withTimeout(promise, ms, label = 'op') {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label}_TIMEOUT_${ms}ms`)), ms)
    )
  ]);
}

function parseMigrateDc(errMsg = '') {
  const m = String(errMsg).match(/(PHONE|NETWORK|USER)_MIGRATE_(\d+)/i);
  return m ? Number(m[2]) : null;
}

class CreatorSession {
  constructor() {
    this.apiId      = null;
    this.apiHash    = null;
    this.phoneNumber = '';
    this.sess       = '';
    this.name       = '';
    this.client     = null;

    // Promise resolvers (pola dari referensi Akun.js)
    this.pendingCode  = null;
    this.pendingPass  = null;
    this.pendingMsgId = null;
    this.loadingMsgId = null;

    this._queuedOtp   = null;
    this._queuedOtpAt = 0;
    this._lastCodeHash = null;
    this._codeIssuedAt = 0;

    this._loginInFlight = false;
  }

  // ── Dipanggil oleh input handler saat ada pesan teks masuk ──
  handleText(text) {
    const t = String(text || '').trim();

    if (this.pendingCode) {
      try { this.pendingCode(t.replace(/\s+/g, '')); } catch {}
      this.pendingCode = null;
      return true;
    }
    if (this.pendingPass) {
      try { this.pendingPass(t); } catch {}
      this.pendingPass = null;
      return true;
    }
    // Queue OTP jika datang sebelum pendingCode terpasang
    if (/^\d{3,8}$/.test(t)) {
      this._queuedOtp   = t;
      this._queuedOtpAt = Date.now();
      return true;
    }
    return false;
  }

  async _safeDeleteLoading(ctx, adminId) {
    if (this.loadingMsgId) {
      try { await ctx.api.deleteMessage(adminId, this.loadingMsgId); } catch {}
      this.loadingMsgId = null;
    }
  }

  cleanup(ctx, adminId) {
    if (this.pendingMsgId) {
      try { ctx.api.deleteMessage(adminId, this.pendingMsgId); } catch {}
      this.pendingMsgId = null;
    }
  }

  cancel(ctx, adminId) {
    this.pendingCode    = null;
    this.pendingPass    = null;
    this._queuedOtp     = null;
    this._queuedOtpAt   = 0;
    this._lastCodeHash  = null;
    this._codeIssuedAt  = 0;
    this.cleanup(ctx, adminId);
    this._safeDeleteLoading(ctx, adminId);
    this._loginInFlight = false;
  }

  // ── Login MTProto — diadaptasi dari Akun.js referensi ───────
  async login(ctx, adminId, phone) {
    const cancelKb = {
      inline_keyboard: [[{ text: 'Batal', callback_data: 'creator_login_cancel' }]]
    };

    const show = async (text) => {
      try { const m = await ctx.api.sendMessage(adminId, text); this.loadingMsgId = m.message_id; } catch {}
    };
    const clearLoading = async () => { await this._safeDeleteLoading(ctx, adminId); };

    // ── manualFlow: SendCode + SignIn manual ─────────────────
    const manualFlow = async () => {
      const settings = new Api.CodeSettings({
        allowFlashcall: false,
        currentNumber:  true,
        allowAppHash:   true,
        allowMissedCall: false
      });

      try {
        const res = await withTimeout(
          this.client.invoke(new Api.auth.SendCode({
            phoneNumber: phone,
            apiId:       this.apiId,
            apiHash:     this.apiHash,
            settings
          })),
          15_000, 'SEND_CODE'
        );
        this._lastCodeHash = res.phoneCodeHash;
        this._codeIssuedAt = Date.now();
      } catch (e) {
        const dc = parseMigrateDc(e?.message || '');
        if (dc && typeof this.client._switchDC === 'function') {
          try { await this.client._switchDC(dc); } catch {}
          const res2 = await this.client.invoke(new Api.auth.SendCode({
            phoneNumber: phone, apiId: this.apiId, apiHash: this.apiHash, settings
          }));
          this._lastCodeHash = res2.phoneCodeHash;
          this._codeIssuedAt = Date.now();
        } else {
          throw new Error('SEND_CODE_FAIL: ' + (e?.message || e));
        }
      }

      await clearLoading();
      this.cleanup(ctx, adminId);

      // Buang OTP lama yang datang sebelum SendCode baru ini
      if (this._queuedOtp && this._queuedOtpAt < this._codeIssuedAt) {
        this._queuedOtp   = null;
        this._queuedOtpAt = 0;
      }

      if (!this._queuedOtp) {
        try {
          const msg = await ctx.api.sendMessage(
            adminId,
            '🔑 *Masukkan kode OTP* yang dikirim Telegram ke nomor Anda:',
            { parse_mode: 'Markdown', reply_markup: cancelKb }
          );
          this.pendingMsgId = msg.message_id;
        } catch {}
      } else {
        try {
          const m = await ctx.api.sendMessage(adminId, '⏳ Memverifikasi kode...');
          this.loadingMsgId = m.message_id;
        } catch {}
      }

      const otp = this._queuedOtp
        ? (() => { const v = this._queuedOtp; this._queuedOtp = null; return v; })()
        : await new Promise(resolve => {
            this.pendingCode = (code) => {
              (async () => {
                try { const m = await ctx.api.sendMessage(adminId, '⏳ Memverifikasi kode...'); this.loadingMsgId = m.message_id; } catch {}
              })();
              resolve(code);
            };
          });

      try {
        await this.client.invoke(new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash: this._lastCodeHash,
          phoneCode: otp
        }));
      } catch (e) {
        const msg = String(e?.message || '').toUpperCase();
        if (msg.includes('SESSION_PASSWORD_NEEDED')) {
          await _handlePassword();
        } else if (msg.includes('PHONE_CODE_INVALID')) {
          await clearLoading();
          this.cleanup(ctx, adminId);
          await ctx.api.sendMessage(adminId,
            '❌ Kode OTP salah atau sudah tidak berlaku.\nMasukkan *kode terbaru* dari Telegram.',
            { parse_mode: 'Markdown' }
          );
          try {
            const msg2 = await ctx.api.sendMessage(adminId,
              '🔑 *Masukkan kode OTP terbaru:*',
              { parse_mode: 'Markdown', reply_markup: cancelKb }
            );
            this.pendingMsgId = msg2.message_id;
          } catch {}
          const otp2 = await new Promise(resolve => {
            this.pendingCode = (code) => resolve(code);
          });
          await this.client.invoke(new Api.auth.SignIn({
            phoneNumber: phone, phoneCodeHash: this._lastCodeHash, phoneCode: otp2
          }));
        } else {
          throw new Error('SIGN_IN_FAIL: ' + (e?.message || e));
        }
      }
    };

    // ── 2FA password ─────────────────────────────────────────
    const _handlePassword = async () => {
      await clearLoading();
      this.cleanup(ctx, adminId);
      try {
        const m = await ctx.api.sendMessage(
          adminId,
          '🔐 *Akun ini dilindungi 2FA.*\nMasukkan password Telegram Anda:',
          { parse_mode: 'Markdown', reply_markup: cancelKb }
        );
        this.pendingMsgId = m.message_id;
      } catch {}
      const pwd = await new Promise(resolve => {
        this.pendingPass = (p) => resolve(p);
      });
      await this.client.checkPassword(pwd);
    };

    // ── Sequence utama ────────────────────────────────────────
    try {
      this._loginInFlight = true;
      this.phoneNumber    = phone;

      this.client = new TelegramClient(
        new StringSession(''),
        this.apiId,
        this.apiHash,
        { connectionRetries: 5 }
      );
      await this.client.connect();
      await show('⏳ Menghubungi server Telegram...');

      const askOtp = async () => {
        await clearLoading();
        this.cleanup(ctx, adminId);
        this._queuedOtp   = null;
        this._queuedOtpAt = 0;
        try {
          const msg = await ctx.api.sendMessage(
            adminId,
            '🔑 *Masukkan kode OTP* yang dikirim Telegram ke nomor Anda:',
            { parse_mode: 'Markdown', reply_markup: cancelKb }
          );
          this.pendingMsgId = msg.message_id;
        } catch {}
        return await new Promise(resolve => {
          this.pendingCode = (code) => {
            (async () => {
              try { const m = await ctx.api.sendMessage(adminId, '⏳ Memverifikasi kode...'); this.loadingMsgId = m.message_id; } catch {}
            })();
            resolve(code);
          };
        });
      };

      const askPass = async () => {
        await clearLoading();
        this.cleanup(ctx, adminId);
        try {
          const m = await ctx.api.sendMessage(
            adminId,
            '🔐 *Akun ini dilindungi 2FA.*\nMasukkan password Telegram Anda:',
            { parse_mode: 'Markdown', reply_markup: cancelKb }
          );
          this.pendingMsgId = m.message_id;
        } catch {}
        return await new Promise(resolve => {
          this.pendingPass = (p) => resolve(p);
        });
      };

      try {
        await withTimeout(
          this.client.start({
            phoneNumber: async () => phone,
            phoneCode:   askOtp,
            password:    askPass,
            onError:     (err) => { throw err; }
          }),
          35_000, 'START'
        );
      } catch (e) {
        const isTimeout = /TIMEOUT/i.test(e?.message || '');
        const dc = parseMigrateDc(e?.message || '');

        if (dc && typeof this.client._switchDC === 'function') {
          try { await this.client._switchDC(dc); } catch {}
        }

        if (isTimeout) {
          // Bersihkan Promise lama agar tidak diresolve dua kali
          this.pendingCode  = null;
          this._queuedOtp   = null;
          this._queuedOtpAt = 0;
          await clearLoading();
          this.cleanup(ctx, adminId);
          try {
            await ctx.api.sendMessage(
              adminId,
              '⚠️ *Koneksi lambat terdeteksi.*\n\nMeminta kode OTP *baru* ke Telegram — harap gunakan *kode terbaru* yang diterima.',
              { parse_mode: 'Markdown' }
            );
          } catch {}
        }

        await manualFlow();
      }

      // ── Sukses — simpan session string ───────────────────
      this.sess = this.client.session.save();
      try {
        const me = await this.client.getMe();
        this.name = me?.firstName || me?.username || phone;
      } catch {}

      return this.sess;

    } finally {
      this._loginInFlight = false;
    }
  }
}

module.exports = CreatorSession;
