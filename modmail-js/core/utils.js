const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLogger } = require('./models');

const logger = getLogger('utils');

function strToBool(val) {
  if (typeof val === 'boolean') return val;
  const str = String(val).toLowerCase();
  if (['y', 'yes', 'on', '1', 'true', 't', 'enable'].includes(str)) return true;
  if (['n', 'no', 'off', '0', 'false', 'f', 'disable'].includes(str)) return false;
  throw new Error(`Invalid truth value: ${val}`);
}

function truncate(text, max = 50) {
  text = text.trim();
  return text.length > max ? text.slice(0, max - 3).trim() + '...' : text;
}

function formatPreview(messages) {
  const previewMessages = messages.slice(0, 3);
  let out = '';
  for (const message of previewMessages) {
    if (['note', 'internal'].includes(message.type)) continue;
    const author = message.author;
    const content = String(message.content).replace(/\n/g, ' ');
    let name = author.name;
    if (author.discriminator && author.discriminator !== '0') {
      name += `#${author.discriminator}`;
    }
    const prefix = author.mod ? '[M]' : '[R]';
    out += truncate(`\`${prefix} ${name}:\` ${content}`, 75) + '\n';
  }
  return out || 'No Messages';
}

function isImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'gyazo.com' && ['http:', 'https:'].includes(parsed.protocol)) {
      url = url.replace(/(https?:\/\/)((?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*(),]|%[0-9a-fA-F][0-9a-fA-F])+)/, '$1i.$2.png');
    }
  } catch (e) {
    // Invalid URL
  }
  return parseImageUrl(url);
}

function parseImageUrl(url, convertSize = true) {
  const types = ['.png', '.jpg', '.gif', '.jpeg', '.webp'];
  try {
    const parsed = new URL(url);
    if (types.some(type => parsed.pathname.toLowerCase().endsWith(type))) {
      if (convertSize) {
        parsed.searchParams.set('size', '128');
      }
      return parsed.toString();
    }
  } catch (e) {
    // Invalid URL
  }
  return '';
}

function humanJoin(seq, delim = ', ', final = 'or') {
  const size = seq.length;
  if (size === 0) return '';
  if (size === 1) return seq[0];
  if (size === 2) return seq.join(` ${final} `);
  return seq.slice(0, -1).join(delim) + `${delim}${final} ` + seq[size - 1];
}

function tryInt(value, defaultValue = 0) {
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function escapeCodeBlock(text) {
  return text.replace(/```/g, '\\`\\`\\`').replace(/`/g, '\\`');
}

function extractForwardedContent(content) {
  // Simplified - extract forwarded message content
  const forwardedMatch = content.match(/^\*\*Forwarded from .+?\*\*:\s*(.+)$/s);
  return forwardedMatch ? forwardedMatch[1] : content;
}

function createNotFoundEmbed(query, type = 'user') {
  const embed = new EmbedBuilder()
    .setTitle('Not Found')
    .setDescription(`Could not find ${type} matching \`${query}\``)
    .setColor(0xff0000)
    .setTimestamp();
  return embed;
}

function triggerTyping(channel) {
  return channel.sendTyping();
}

async function safeTyping(channel, timeout = 10000) {
  try {
    await triggerTyping(channel);
    // In Discord.js, typing is automatic for messages
  } catch (error) {
    logger.warn('Failed to trigger typing', error);
  }
}

function getTopRole(member) {
  return member.roles.highest;
}

function getJointId(user1, user2) {
  return [user1.id, user2.id].sort().join('_');
}

function returnOrTruncate(text, maxLength = 2000) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

class AcceptButton extends ButtonBuilder {
  constructor() {
    super()
      .setCustomId('accept')
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');
  }
}

class DenyButton extends ButtonBuilder {
  constructor() {
    super()
      .setCustomId('deny')
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');
  }
}

class ConfirmThreadCreationView {
  constructor() {
    this.acceptButton = new AcceptButton();
    this.denyButton = new DenyButton();
    this.row = new ActionRowBuilder()
      .addComponents(this.acceptButton, this.denyButton);
  }

  get components() {
    return [this.row];
  }
}

module.exports = {
  strToBool,
  truncate,
  formatPreview,
  isImageUrl,
  parseImageUrl,
  humanJoin,
  tryInt,
  escapeCodeBlock,
  extractForwardedContent,
  createNotFoundEmbed,
  triggerTyping,
  safeTyping,
  getTopRole,
  getJointId,
  returnOrTruncate,
  AcceptButton,
  DenyButton,
  ConfirmThreadCreationView
};