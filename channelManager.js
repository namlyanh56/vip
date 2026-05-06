const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const config = require('../config');

const clients = new Map();

exports.initialize = () => {
  console.log('[ChannelManager] Initialized');
};

// ─────────────────────────────────────────────
// INTERNAL: get or create MTProto client
// ─────────────────────────────────────────────
async function getClientForAccount(account) {
  if (clients.has(account.id)) {
    const existing = clients.get(account.id);
    if (!existing.connected) await existing.connect();
    return existing;
  }

  const client = new TelegramClient(
    new StringSession(account.sessionString || ''),
    parseInt(account.apiId),
    account.apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  clients.set(account.id, client);
  return client;
}

// ─────────────────────────────────────────────
// Create a private megagroup channel
// ─────────────────────────────────────────────
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
    console.log(`[ChannelManager] Created channel: ${channel.id}`);
    return channel.id;
  } catch (err) {
    console.error('Create channel error:', err.message);
    throw err;
  }
};

// ─────────────────────────────────────────────
// Add the Telegram Bot as admin (inviteUsers right)
// ─────────────────────────────────────────────
exports.addBotAsAdmin = async (account, channelId, botUserId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.channels.EditAdmin({
        channel: channelId,
        userId: botUserId,
        adminRights: new Api.ChatAdminRights({
          changeInfo: false,
          postMessages: false,
          editMessages: false,
          deleteMessages: false,
          banUsers: false,
          inviteUsers: true,   // needed to approve join requests
          pinMessages: false,
          addAdmins: false,
          anonymous: false,
          manageCall: false,
          other: false,
          manageTopics: false
        }),
        rank: ''
      })
    );

    console.log(`[ChannelManager] Bot added as admin in channel ${channelId}`);
  } catch (err) {
    console.error('Add bot as admin error:', err.message);
    throw err;
  }
};

// ─────────────────────────────────────────────
// Forward a video message from source group to channel
// ─────────────────────────────────────────────
exports.forwardVideoToChannel = async (account, sourceGroupId, msgId, targetChannelId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.messages.ForwardMessages({
        fromPeer: sourceGroupId,
        id: [msgId],
        toPeer: targetChannelId,
        noforwards: true,
        silent: false,
        randomId: [BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))]
      })
    );
  } catch (err) {
    console.error(`Forward error (msg ${msgId}):`, err.message);
    // Non-fatal: continue with remaining messages
  }
};

// ─────────────────────────────────────────────
// Create a join-request invite link (requestNeeded = true)
// Users must request to join; bot will approve/decline
// ─────────────────────────────────────────────
exports.createJoinRequestLink = async (account, channelId) => {
  try {
    const client = await getClientForAccount(account);

    const result = await client.invoke(
      new Api.messages.ExportChatInvite({
        peer: channelId,
        requestNeeded: true,          // <── triggers join-request flow
        legacyRevokePermanent: false
      })
    );

    console.log(`[ChannelManager] Join-request link created: ${result.link}`);
    return result.link;
  } catch (err) {
    console.error('Create invite error:', err.message);
    throw err;
  }
};

// ─────────────────────────────────────────────
// Revoke (delete) a specific invite link so it can't be reused
// ─────────────────────────────────────────────
exports.revokeInviteLink = async (account, channelId, link) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.messages.DeleteExportedChatInvite({
        peer: channelId,
        link
      })
    );

    console.log(`[ChannelManager] Revoked invite link for channel ${channelId}`);
  } catch (err) {
    console.error('Revoke invite link error:', err.message);
    // Non-fatal
  }
};

// ─────────────────────────────────────────────
// WARRANTY: Check if channel is still accessible (not banned/deleted)
// ─────────────────────────────────────────────
exports.checkChannelAccessible = async (account, channelId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.channels.GetFullChannel({
        channel: channelId
      })
    );

    return true; // Channel exists and is accessible
  } catch (err) {
    console.log(`[ChannelManager] Channel ${channelId} not accessible: ${err.message}`);
    return false; // Channel is blocked, deleted, or inaccessible
  }
};

// ─────────────────────────────────────────────
// WARRANTY: Check if a specific user is still a member
// ─────────────────────────────────────────────
exports.checkUserInChannel = async (account, channelId, userId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.channels.GetParticipant({
        channel: channelId,
        participant: userId
      })
    );

    return true; // User is still a participant
  } catch (err) {
    console.log(`[ChannelManager] User ${userId} not in channel ${channelId}: ${err.message}`);
    return false;
  }
};

// ─────────────────────────────────────────────
// Creator account leaves the channel
// Called only after the bot has already left (purchase complete + user joined)
// ─────────────────────────────────────────────
exports.creatorLeavesChannel = async (account, channelId) => {
  try {
    const client = await getClientForAccount(account);

    await client.invoke(
      new Api.channels.LeaveChannel({
        channel: channelId
      })
    );

    console.log(`[ChannelManager] Creator account left channel ${channelId}`);
  } catch (err) {
    console.error('Creator leave channel error:', err.message);
  }
};
