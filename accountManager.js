const config = require('../config');

let accounts = [...config.creatorAccounts];

exports.initialize = () => {
  console.log(`[AccountManager] Initialized ${accounts.length} creator account(s)`);
  accounts.forEach(a => {
    console.log(`  → ID ${a.id} | Active: ${a.active} | Phone: ${a.phoneNumber}`);
  });
};

// ─────────────────────────────────────────────
// Get first active account that hasn't hit channel-create limit
// Auto-resets all limits as last-resort failover
// ─────────────────────────────────────────────
exports.getAvailableAccount = async () => {
  let available = accounts.find(a => a.active && !a.limitReached);

  if (!available) {
    console.warn('[AccountManager] All accounts at limit — resetting flags (failover)');
    accounts.forEach(a => { if (a.active) a.limitReached = false; });
    available = accounts.find(a => a.active);
  }

  if (!available) {
    throw new Error('Tidak ada akun creator yang aktif');
  }

  return available;
};

// ─────────────────────────────────────────────
// Lookup by ID — used by warranty & join-request handlers
// ─────────────────────────────────────────────
exports.getAccountById = (accountId) => {
  return accounts.find(a => a.id === accountId) || null;
};

// ─────────────────────────────────────────────
// Mark an account as having hit Telegram's channel-create limit
// ─────────────────────────────────────────────
exports.markAccountLimited = (accountId) => {
  const acc = accounts.find(a => a.id === accountId);
  if (acc) {
    acc.limitReached = true;
    console.warn(`[AccountManager] Account ${accountId} marked as limited`);
  }
};

exports.resetAccountLimit = (accountId) => {
  const acc = accounts.find(a => a.id === accountId);
  if (acc) {
    acc.limitReached = false;
    console.log(`[AccountManager] Account ${accountId} limit reset`);
  }
};

exports.getAllAccounts = () => accounts.map(a => ({ ...a, sessionString: '***' }));

// ─────────────────────────────────────────────
// Runtime account management (admin use)
// ─────────────────────────────────────────────
exports.addAccount = (account) => {
  account.id          = Math.max(0, ...accounts.map(a => a.id)) + 1;
  account.active      = account.active ?? true;
  account.limitReached = false;
  accounts.push(account);
  console.log(`[AccountManager] Added account ID ${account.id}`);
  return account;
};

exports.removeAccount = (accountId) => {
  accounts = accounts.filter(a => a.id !== accountId);
  console.log(`[AccountManager] Removed account ID ${accountId}`);
};

exports.setAccountActive = (accountId, active) => {
  const acc = accounts.find(a => a.id === accountId);
  if (acc) acc.active = active;
};
