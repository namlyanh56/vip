const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const config = require('../config');

let accounts = config.creatorAccounts;

exports.initialize = () => {
  console.log(`[AccountManager] Initialized ${accounts.length} creator accounts`);
};

exports.getAvailableAccount = async () => {
  // Find active account not at limit
  const available = accounts.find(a => a.active && !a.limitReached);
  
  if (!available) {
    // Failover: reset limit reached accounts
    accounts.forEach(a => a.limitReached = false);
    return accounts.find(a => a.active);
  }

  return available;
};

exports.markAccountLimited = (accountId) => {
  const acc = accounts.find(a => a.id === accountId);
  if (acc) acc.limitReached = true;
};

exports.resetAccountLimit = (accountId) => {
  const acc = accounts.find(a => a.id === accountId);
  if (acc) acc.limitReached = false;
};

exports.getAllAccounts = () => accounts;

exports.addAccount = (account) => {
  account.id = Math.max(...accounts.map(a => a.id), 0) + 1;
  accounts.push(account);
  return account;
};

exports.removeAccount = (accountId) => {
  accounts = accounts.filter(a => a.id !== accountId);
};
