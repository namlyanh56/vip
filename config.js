// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FILE
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Packages Configuration
  packages: {
    A: {
      id: 'A',
      name: '📚 Paket Starter',
      price: 100,
      description: '10 Video Tutorial\n✅ Akses seumur hidup\n✅ Update gratis',
      videos: 10
    },
    B: {
      id: 'B',
      name: '🎓 Paket Professional',
      price: 200,
      description: '25 Video Pro\n✅ Mentoring eksklusif\n✅ Garansi 30 hari',
      videos: 25
    },
    C: {
      id: 'C',
      name: '👑 Paket Premium',
      price: 400,
      description: '50+ Video Premium\n✅ Priority support\n✅ Sertifikat digital',
      videos: 50
    },
    D: {
      id: 'D',
      name: '💡 Paket Basic',
      price: 72,
      description: '5 Video Dasar\n✅ Akses 1 bulan\n✅ Refresh gratis',
      videos: 5
    },
    E: {
      id: 'E',
      name: '🚀 Paket Growth',
      price: 130,
      description: '15 Video Growth\n✅ Mentoring grup\n✅ Update mingguan',
      videos: 15
    },
    F: {
      id: 'F',
      name: '💎 Paket Master',
      price: 300,
      description: '40+ Video Master\n✅ Akses unlimited\n✅ Lifetime support',
      videos: 40
    }
  },

  // Content Mapping (Message IDs from source group)
  packageContent: {
    A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    B: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    C: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 
        26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50],
    D: [1, 2, 3, 4, 5],
    E: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    F: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 
        26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]
  },

  // Creator Accounts (login credentials + session strings)
  creatorAccounts: [
    {
      id: 1,
      apiId: process.env.API_ID,
      apiHash: process.env.API_HASH,
      phoneNumber: '+62812345678', // Replace with actual phone
      sessionString: '', // Will be filled after login
      active: true,
      limitReached: false
    },
    // Add more accounts as needed
  ],

  // Source group (where master content is stored)
  sourceGroupId: -1001234567890, // Replace with actual group ID

  // Bot API endpoint
  botToken: process.env.BOT_TOKEN,

  // Admin settings
  adminId: process.env.ADMIN_ID,

  // Warranty settings
  warrantyCheckInterval: 24 * 60 * 60 * 1000, // 24 hours
  maxWarrantyAttempts: 1
};
