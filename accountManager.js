const fs     = require('fs');
const path   = require('path');
const config = require('../config');

const accountsFile = path.join('./data', 'accounts.json');

function _loadDynamic() {
  try { return JSON.parse(fs.readFileSync(accountsFile, 'utf8')); }
  catch { return []; }
}

function _saveDynamic(list) {
  try {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync(accountsFile, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('[AccountManager] Save failed:', e.message);
  }
}

let accounts = [];

exports.initialize = () => {
  const staticAccs  = config.creatorAccounts || [];
  const dynamicAccs = _loadDynamic();
  const staticIds   = new Set(staticAccs.map(a => String(a.id)));

  accounts = [
    ...staticAccs,
    ...dynamicAccs.filter(a => !staticIds.has(String(a.id)))
  ];

  accounts.forEach(a => { a.limitReached = false; });

  console.log(`[AccountManager] Initialized ${accounts.length} account(s)`);
  accounts.forEach(a =>
    console.log(`  → ID ${a.id} | ${a.phoneNumber} | Active: ${a.active}`)
  );
};

exports.getAvailableAccount = async () => {
  let available = accounts.find(a => a.active && !a.limitReached);
  if (!available) {
    console.warn('[AccountManager] All limited — resetting (failover)');
    accounts.forEach(a => { if (a.active) a.limitReached = false; });
    available = accounts.find(a => a.active);
  }
  if (!available) throw new Error('Tidak ada akun creator aktif');
  return available;
};

exports.getAccountById = (id) =>
  accounts.find(a => String(a.id) === String(id)) || null;

exports.markAccountLimited = (id) => {
  const a = accounts.find(a => String(a.id) === String(id));
  if (a) { a.limitReached = true; console.warn(`[AccountManager] Account ${id} limited`); }
};

exports.resetAccountLimit = (id) => {
  const a = accounts.find(a => String(a.id) === String(id));
  if (a) a.limitReached = false;
};

exports.setAccountActive = (id, active) => {
  const a = accounts.find(a => String(a.id) === String(id));
  if (a) { a.active = active; _persistDynamic(); }
};

exports.getAllAccounts = () => accounts.map(a => ({
  id: a.id, phoneNumber: a.phoneNumber,
  name: a.name || '', active: a.active, limitReached: a.limitReached
}));

exports.addAccount = (account) => {
  const maxId = Math.max(0, ...accounts.map(a => Number(a.id) || 0));
  account.id           = maxId + 1;
  account.limitReached = false;
  accounts.push(account);
  _persistDynamic();
  console.log(`[AccountManager] Added ID ${account.id} (${account.phoneNumber})`);
  return account;
};

exports.removeAccount = (id) => {
  accounts = accounts.filter(a => String(a.id) !== String(id));
  _persistDynamic();
};

function _persistDynamic() {
  const staticIds = new Set((config.creatorAccounts || []).map(a => String(a.id)));
  _saveDynamic(accounts.filter(a => !staticIds.has(String(a.id))));
}
