const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const config = require('../config');

const clients = new Map();

exports.initialize = () => {
  console.log('[ChannelManager] Initialized');
};

async function getClientForAccount(account) {
  if (clients.has(account.id)) {
    return clients.get(account.id);
  }

  const client = new TelegramClient(
    new StringSession(account.sessionString || ''),
    account.apiId,
    account.apiHash,
    { connectionRetries: 5 }
  );

  if (!client.connected) {
    await client.connect();
  }

  clients.set(account.id, client);
  return client;
}

exports.createPrivateChannel = async (account, title) => {
  try {
    const client = await getClientForAccount(account);
    
    const result = await client.invoke(
      new Api.channels.CreateChannel({
        title,
        about: 'Premium Content Channel',
        broadcast: false,
        megagroup: true
      })
    );

    const channel = result.chats[0];
    return channel.id;
  } catch (err) {
    console.error('Create channel error:', err);
    throw err;
  }
};

exports.forwardVideoToChannel = async (account, sourceGroupId, msgId, targetChannelId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.messages.ForwardMessages({
        fromPeer: sourceGroupId,
        id: [msgId],
        toPeer: targetChannelId,
        noforwards: true,
        silent: false
      })
    );
  } catch (err) {
    console.error(`Forward error (msg ${msgId}):`, err);
  }
};

exports.createJoinRequestLink = async (account, channelId) => {
  try {
    const client = await getClientForAccount(account);

    const link = await client.invoke(
      new Api.channels.ExportInvite({
        channel: channelId,
        legacyRevokePermanent: false
      })
    );

    return link.link || `https://t.me/+${link.slug}`;
  } catch (err) {
    console.error('Create invite error:', err);
    throw err;
  }
};

exports.resetInviteLink = async (account, channelId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.channels.EditInviteLink({
        channel: channelId,
        link: channelId.toString(),
        expireDate: Math.floor(Date.now() / 1000) // Expire immediately
      })
    );
  } catch (err) {
    console.error('Reset invite error:', err);
  }
};

exports.botLeavesChannel = async (account, channelId) => {
  try {
    const client = await getClientForAccount(account);
    
    await client.invoke(
      new Api.channels.LeaveChannel({
        channel: channelId
      })
    );
  } catch (err) {
    console.error('Leave channel error:', err);
  }
};
