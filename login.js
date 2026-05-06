/**
 * ═══════════════════════════════════════════════════════════════
 * SESSION LOGIN HELPER
 * Run this ONCE per creator account to generate a session string.
 * Copy the output into your .env as SESSION_1, SESSION_2, etc.
 *
 * Usage:
 *   node login.js
 * ═══════════════════════════════════════════════════════════════
 */

const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const input              = require('input'); // npm install input
require('dotenv').config();

const API_ID   = parseInt(process.env.API_ID_1);
const API_HASH = process.env.API_HASH_1;

(async () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Telegram MTProto Session Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!API_ID || !API_HASH) {
    console.error('❌ API_ID_1 and API_HASH_1 must be set in .env');
    process.exit(1);
  }

  const client = new TelegramClient(
    new StringSession(''),
    API_ID,
    API_HASH,
    { connectionRetries: 5 }
  );

  await client.start({
    phoneNumber: async () => {
      return await input.text('📱 Masukkan nomor telepon (format +628xx): ');
    },
    password: async () => {
      return await input.text('🔐 Masukkan password 2FA (kosongkan jika tidak ada): ');
    },
    phoneCode: async () => {
      return await input.text('🔑 Masukkan kode OTP yang dikirim Telegram: ');
    },
    onError: (err) => {
      console.error('Login error:', err.message);
    }
  });

  const sessionString = client.session.save();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Login berhasil! Tambahkan baris ini ke .env:\n');
  console.log(`SESSION_1="${sessionString}"`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  JANGAN bagikan session string ini kepada siapapun!\n');

  await client.disconnect();
  process.exit(0);
})();
