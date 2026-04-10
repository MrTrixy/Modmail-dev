const fs = require('fs');
const path = require('path');
const { getLogger } = require('./models');

const logger = getLogger(__name__);

class ConfigManager {
  constructor(bot) {
    this.bot = bot;
    this._cache = {}; // Will store guild-specific configs
    this._globalCache = {}; // Global config
    this.ready = false;
    this.defaults = {
      // Activity
      twitch_url: "https://www.twitch.tv/discordmodmail/",
      // Bot settings
      main_category_id: null,
      fallback_category_id: null,
      prefix: "?",
      mention: "@here",
      main_color: 0x5865f2, // Discord blurple
      error_color: 0xff0000, // Red
      user_typing: false,
      mod_typing: false,
      account_age: "P0D",
      guild_age: "P0D",
      thread_cooldown: "P0D",
      log_expiration: "P0D",
      reply_without_command: false,
      anon_reply_without_command: false,
      plain_reply_without_command: false,
      // Logging
      log_channel_id: null,
      mention_channel_id: null,
      update_channel_id: null,
      // Updates
      update_notifications: true,
      // Threads
      sent_emoji: "✅",
      blocked_emoji: "🚫",
      close_emoji: "🔒",
      use_user_id_channel_name: false,
      use_timestamp_channel_name: false,
      use_nickname_channel_name: false,
      use_random_channel_name: false,
      recipient_thread_close: false,
      thread_show_roles: true,
      thread_show_account_age: true,
      thread_show_join_age: true,
      thread_cancelled: "Cancelled",
      thread_auto_close_silently: false,
      thread_auto_close: "P0D",
      thread_auto_close_response: "This thread has been closed automatically due to inactivity after {timeout}.",
      thread_creation_response: "The staff team will get back to you as soon as possible.",
      thread_creation_footer: "Your message has been sent",
      thread_contact_silently: false,
      thread_self_closable_creation_footer: "Click the lock to close the thread",
      thread_creation_contact_title: "New Thread",
      thread_creation_self_contact_response: "You have opened a Modmail thread.",
      thread_creation_contact_response: "{creator.name} has opened a Modmail thread.",
      thread_creation_title: "Thread Created",
      thread_creation_send_dm_embed: true,
      thread_close_footer: "Replying will create a new thread",
      thread_close_title: "Thread Closed",
      thread_close_response: "{closer.mention} has closed this Modmail thread.",
      thread_self_close_response: "You have closed this Modmail thread.",
      // ... add more defaults as needed
      // Protected
      modmail_guild_id: null,
      guild_id: null,
      log_url: "https://example.com/",
      log_url_prefix: "/logs",
      token: null,
      log_level: "info",
      // Private
      activity_message: "",
      activity_type: null,
      status: null,
      dm_disabled: 0,
      blocked: {},
      command_permissions: {},
      level_permissions: {},
      snippets: {},
      aliases: {},
      closures: {}
    };
  }

  populateCache() {
    let globalData = { ...this.defaults };

    // Load from .env
    require('dotenv').config();
    for (const [key, value] of Object.entries(process.env)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey in this.defaults) {
        globalData[lowerKey] = value;
      }
    }

    // Load from config.json if exists
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        for (const [key, value] of Object.entries(configData)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey in this.defaults) {
            globalData[lowerKey] = value;
          }
        }
      } catch (err) {
        logger.error('Failed to load config.json', err);
      }
    }

    this._globalCache = globalData;
    this._cache = {}; // Guild-specific configs will be loaded from DB
    return this._globalCache;
  }

  async update(guildId = null) {
    await this.bot.api.updateConfig(this._cache[guildId] || this._globalCache, guildId);
  }

  async refresh() {
    // Load global config
    const globalConfig = await this.bot.api.getConfig();
    for (const [key, value] of Object.entries(globalConfig)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey in this.defaults) {
        this._globalCache[lowerKey] = value;
      }
    }

    // Load guild-specific configs
    for (const guild of this.bot.guilds.cache.values()) {
      const guildConfig = await this.bot.api.getConfig(guild.id);
      if (Object.keys(guildConfig).length > 0) {
        this._cache[guild.id] = {};
        for (const [key, value] of Object.entries(guildConfig)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey in this.defaults) {
            this._cache[guild.id][lowerKey] = value;
          }
        }
      }
    }

    this.ready = true;
    logger.debug('Successfully fetched configurations from database.');
    return this._globalCache;
  }

  get(key, guildId = null, convert = true) {
    const lowerKey = key.toLowerCase();

    if (!(lowerKey in this.defaults)) {
      throw new Error(`Configuration "${key}" is invalid.`);
    }

    // Check guild-specific config first
    if (guildId && this._cache[guildId] && lowerKey in this._cache[guildId]) {
      return this._cache[guildId][lowerKey];
    }

    // Fall back to global config
    return this._globalCache[lowerKey] || this.defaults[lowerKey];
  }

  set(key, value, guildId = null) {
    const lowerKey = key.toLowerCase();
    if (!(lowerKey in this.defaults)) {
      throw new Error(`Configuration "${key}" is invalid.`);
    }

    if (guildId) {
      if (!this._cache[guildId]) {
        this._cache[guildId] = {};
      }
      this._cache[guildId][lowerKey] = value;
    } else {
      this._globalCache[lowerKey] = value;
    }
  }

  remove(key, guildId = null) {
    const lowerKey = key.toLowerCase();
    if (guildId && this._cache[guildId]) {
      delete this._cache[guildId][lowerKey];
    } else if (lowerKey in this._globalCache) {
      delete this._globalCache[lowerKey];
    }
    return this.defaults[lowerKey];
  }

  get validKeys() {
    return new Set(Object.keys(this.defaults));
  }

  get protectedKeys() {
    return new Set([
      'modmail_guild_id', 'guild_id', 'log_url', 'log_url_prefix',
      'token', 'log_level', 'stream_log_format', 'file_log_format'
    ]);
  }
}

module.exports = { ConfigManager };