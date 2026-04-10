const { getLogger } = require('./models');
const { EmbedBuilder } = require('discord.js');
const { parseDuration } = require('./time');

const logger = getLogger('thread');

class Thread {
  constructor(manager, recipient, channel = null, otherRecipients = []) {
    this.manager = manager;
    this.bot = manager.bot;
    this._id = typeof recipient === 'number' ? recipient : recipient.id;
    this._recipient = typeof recipient === 'number' ? null : recipient;
    this._otherRecipients = otherRecipients || [];
    this._channel = channel;
    this._genesisMessage = null;
    this._ready = false;
    this.waitTasks = [];
    this.closeTask = null;
    this.autoCloseTask = null;
    this._cancelled = false;
    this.snoozed = false;
    this.snoozeData = null;
    this.logKey = null;
    this._unsnoozing = false;
    this._commandQueue = [];
    this.lastActivity = Date.now();
  }

  get id() {
    return this._id;
  }

  get recipient() {
    return this._recipient;
  }

  get channel() {
    return this._channel;
  }

  get otherRecipients() {
    return this._otherRecipients;
  }

  async waitUntilReady() {
    if (this._ready) return;
    // Simple wait
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async setup() {
    if (!this._channel) {
      // Create channel
      const guild = this.bot.getGuild(this.bot.config.get('modmail_guild_id', this._recipient.guild?.id));
      const categoryId = this.bot.config.get('main_category_id', guild?.id);
      const category = categoryId ? guild?.channels.cache.get(categoryId) : null;
      const channelName = this.generateChannelName();

      this._channel = await guild.channels.create({
        name: channelName,
        type: 0, // Text channel
        parent: category,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel']
          },
          {
            id: this.bot.user.id,
            allow: ['ViewChannel', 'SendMessages', 'EmbedLinks']
          }
        ]
      });

      // Create log entry
      this.logKey = await this.bot.api.createLogEntry(this._recipient, this._channel, this.bot.user);

      // Send genesis message
      const embed = new EmbedBuilder()
        .setTitle('Thread Created')
        .setDescription(`Thread opened by ${this._recipient.username}`)
        .setColor(this.bot.config.get('main_color', guild?.id))
        .setTimestamp();

      this._genesisMessage = await this._channel.send({ embeds: [embed] });
    }

    this._ready = true;
    logger.info(`Thread setup complete for ${this._recipient.username}`);
  }

  generateChannelName() {
    // Simplified
    return `${this._recipient.username}-${this._recipient.discriminator}`;
  }

  async send(message) {
    await this.waitUntilReady();

    // Update last activity
    this.updateActivity();

    // Format embed
    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.author.username,
        iconURL: message.author.displayAvatarURL()
      })
      .setDescription(message.content)
      .setColor(message.author.bot ? this.bot.config.get('mod_color') : this.bot.config.get('recipient_color'))
      .setTimestamp(message.createdAt);

    if (message.attachments.size > 0) {
      embed.setImage(message.attachments.first().url);
    }

    await this._channel.send({ embeds: [embed] });

    // Log to DB
    await this.bot.api.appendLog(message, '', this._channel.id, 'thread_message');

    // Start auto-close timer
    this.startAutoCloseTimer();
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  startAutoCloseTimer() {
    // Clear existing timer
    if (this.autoCloseTask) {
      clearTimeout(this.autoCloseTask);
    }

    const timeoutStr = this.bot.config.get('thread_auto_close');
    if (!timeoutStr || timeoutStr === 'P0D') return;

    const timeoutMs = parseDuration(timeoutStr);
    if (timeoutMs <= 0) return;

    this.autoCloseTask = setTimeout(async () => {
      try {
        const silent = this.bot.config.get('thread_auto_close_silently');
        await this.close(null, silent);
        logger.info(`Auto-closed thread for ${this._recipient.username} due to inactivity`);
      } catch (error) {
        logger.error('Failed to auto-close thread', error);
      }
    }, timeoutMs);
  }

  async reply(content, anonymous = false) {
    await this.waitUntilReady();

    // Update last activity
    this.updateActivity();

    const embed = new EmbedBuilder()
      .setDescription(content)
      .setColor(this.bot.config.get('mod_color'))
      .setTimestamp();

    if (anonymous) {
      embed.setAuthor({
        name: this.bot.config.get('anon_username') || 'Moderator',
        iconURL: this.bot.config.get('anon_avatar_url')
      });
    }

    await this._recipient.send({ embeds: [embed] });
    await this._channel.send({ embeds: [embed] });

    // Log
    const fakeMessage = {
      author: { id: this.bot.user.id, username: 'Moderator', bot: true },
      content: content,
      createdTimestamp: Date.now(),
      attachments: []
    };
    await this.bot.api.appendLog(fakeMessage, '', this._channel.id, 'anonymous');

    // Start auto-close timer
    this.startAutoCloseTimer();
  }

  async close(closer = null, silent = false) {
    if (!this._channel) return;

    // Clear timers
    if (this.autoCloseTask) {
      clearTimeout(this.autoCloseTask);
    }

    // Update log
    const log = await this.bot.api.getLog(this._channel.id);
    if (log) {
      log.open = false;
      log.closed_at = new Date().toISOString();
      if (closer) {
        log.closer = JSON.stringify({
          id: closer.id.toString(),
          name: closer.username,
          discriminator: closer.discriminator,
          avatar_url: closer.displayAvatarURL()
        });
      }
      await this.bot.api.postLog(this._channel.id, log);
    }

    // Send close message if not silent
    if (!silent) {
      const embed = new EmbedBuilder()
        .setTitle('Thread Closed')
        .setDescription('This thread has been closed.')
        .setColor(this.bot.config.get('main_color'))
        .setTimestamp();

      try {
        await this._recipient.send({ embeds: [embed] });
      } catch (error) {
        logger.warn('Failed to send close notification to user', error);
      }

      // Send to log channel if configured
      const logChannelId = this.bot.config.get('log_channel_id');
      if (logChannelId) {
        const logChannel = this.bot.channels.cache.get(logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('Thread Closed')
            .setDescription(`Thread for ${this._recipient.username} has been closed.`)
            .setColor(this.bot.config.get('main_color'))
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    }

    // Remove from threads cache
    this.manager.threads.delete(this._id);

    // Delete channel
    try {
      await this._channel.delete();
    } catch (error) {
      logger.warn('Failed to delete thread channel', error);
    }

    logger.info(`Thread closed for ${this._recipient.username}`);
  }

  async snooze(duration = null) {
    if (this.snoozed) return;

    const snoozeDuration = duration || (this.bot.config.get('snooze_default_duration') * 1000) || (7 * 24 * 60 * 60 * 1000); // 7 days default
    const snoozeUntil = Date.now() + snoozeDuration;

    // Store snooze data
    this.snoozeData = {
      channel_id: this._channel.id,
      channel_name: this._channel.name,
      parent_id: this._channel.parentId,
      position: this._channel.position,
      permission_overwrites: this._channel.permissionOverwrites.cache.map(overwrite => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.toArray(),
        deny: overwrite.deny.toArray()
      })),
      messages: [], // Will be populated if storing attachments
      snoozed_at: Date.now(),
      snooze_until: snoozeUntil
    };

    // Store recent messages if configured
    if (this.bot.config.get('snooze_store_attachments')) {
      try {
        const messages = await this._channel.messages.fetch({ limit: 50 });
        this.snoozeData.messages = messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          author: {
            id: msg.author.id,
            username: msg.author.username,
            discriminator: msg.author.discriminator,
            avatar_url: msg.author.displayAvatarURL(),
            bot: msg.author.bot
          },
          timestamp: msg.createdTimestamp,
          attachments: msg.attachments.map(att => ({
            id: att.id,
            name: att.name,
            url: att.url,
            size: att.size
          })),
          embeds: msg.embeds.map(embed => embed.toJSON())
        })).reverse(); // Oldest first
      } catch (error) {
        logger.warn('Failed to store messages for snooze', error);
      }
    }

    const behavior = this.bot.config.get('snooze_behavior', 'delete');

    if (behavior === 'move') {
      const snoozedCategoryId = this.bot.config.get('snoozed_category_id');
      if (snoozedCategoryId) {
        await this._channel.setParent(snoozedCategoryId);
        await this._channel.setName(`snoozed-${this._channel.name}`);
      } else {
        // Fall back to delete behavior
        await this._channel.delete();
      }
    } else {
      // Default: delete behavior
      await this._channel.delete();
    }

    this.snoozed = true;

    // Update log in database
    const log = await this.bot.api.getLog(this._channel.id);
    if (log) {
      log.snoozed = true;
      log.snooze_data = this.snoozeData;
      await this.bot.api.postLog(this._channel.id, log);
    }

    // Send snooze notification
    const embed = new EmbedBuilder()
      .setTitle('Thread Snoozed')
      .setDescription(this.bot.config.get('snooze_text', 'This thread has been snoozed. The channel will be restored when the user replies or a moderator unsnoozes it.'))
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    try {
      await this._recipient.send({ embeds: [embed] });
    } catch (error) {
      logger.warn('Failed to send snooze notification to user', error);
    }

    // Schedule auto-unsnooze
    this.scheduleUnsnooze(snoozeUntil);

    logger.info(`Thread snoozed for ${this._recipient.username}`);
  }

  async unsnooze() {
    if (!this.snoozed || !this.snoozeData) return;

    const behavior = this.bot.config.get('snooze_behavior', 'delete');

    if (behavior === 'move') {
      // Channel still exists, just move it back
      const originalParent = this.snoozeData.parent_id;
      if (originalParent) {
        await this._channel.setParent(originalParent);
      }
      await this._channel.setName(this.snoozeData.channel_name.replace('snoozed-', ''));
      await this._channel.setPosition(this.snoozeData.position);
    } else {
      // Recreate the channel
      const guild = this.bot.getGuild(this.bot.config.get('modmail_guild_id'));
      this._channel = await guild.channels.create({
        name: this.snoozeData.channel_name,
        type: 0,
        parent: this.snoozeData.parent_id,
        position: this.snoozeData.position,
        permissionOverwrites: this.snoozeData.permission_overwrites.map(overwrite => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow,
          deny: overwrite.deny
        }))
      });
    }

    // Restore messages if stored
    if (this.snoozeData.messages && this.snoozeData.messages.length > 0) {
      for (const msgData of this.snoozeData.messages) {
        const embed = new EmbedBuilder()
          .setAuthor({
            name: msgData.author.username,
            iconURL: msgData.author.avatar_url
          })
          .setDescription(msgData.content)
          .setColor(msgData.author.bot ? this.bot.config.get('mod_color') : this.bot.config.get('recipient_color'))
          .setTimestamp(msgData.timestamp);

        if (msgData.attachments && msgData.attachments.length > 0) {
          embed.setImage(msgData.attachments[0].url);
        }

        await this._channel.send({ embeds: [embed] });
      }
    }

    // Send unsnooze notification
    const embed = new EmbedBuilder()
      .setTitle('Thread Unsnoozed')
      .setDescription(this.bot.config.get('unsnooze_text', 'This thread has been unsnoozed and restored.'))
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    await this._channel.send({ embeds: [embed] });

    this.snoozed = false;
    this.snoozeData = null;

    // Update log in database
    const log = await this.bot.api.getLog(this._channel.id);
    if (log) {
      log.snoozed = false;
      log.snooze_data = null;
      await this.bot.api.postLog(this._channel.id, log);
    }

    // Process queued commands
    for (const command of this._commandQueue) {
      try {
        await command();
      } catch (error) {
        logger.error('Failed to execute queued command', error);
      }
    }
    this._commandQueue = [];

    // Start auto-close timer
    this.startAutoCloseTimer();

    logger.info(`Thread unsnoozed for ${this._recipient.username}`);
  }

  scheduleUnsnooze(snoozeUntil) {
    const delay = snoozeUntil - Date.now();
    if (delay > 0) {
      setTimeout(async () => {
        if (this.snoozed) {
          await this.unsnooze();
          logger.info(`Auto-unsnoozed thread for ${this._recipient.username}`);
        }
      }, delay);
    }
  }
}

class ThreadManager {
  constructor(bot) {
    this.bot = bot;
    this.threads = new Map(); // recipient ID -> Thread
  }

  async find(recipient, channel = null) {
    const id = typeof recipient === 'number' ? recipient : recipient.id;
    let thread = this.threads.get(id);

    if (!thread) {
      thread = new Thread(this, recipient, channel);
      this.threads.set(id, thread);
      await thread.setup();
    }

    return thread;
  }

  async populateCache() {
    // Load existing threads from DB
    const openLogs = await this.bot.api.getOpenLogs();
    for (const log of openLogs) {
      try {
        const recipient = await this.bot.users.fetch(log.recipient.id);
        let channel = null;

        // Check if thread is snoozed
        if (log.snoozed && log.snooze_data) {
          const snoozeData = typeof log.snooze_data === 'string' ? JSON.parse(log.snooze_data) : log.snooze_data;
          const behavior = this.bot.config.get('snooze_behavior', 'delete');

          if (behavior === 'move') {
            // Try to find the moved channel
            channel = this.bot.channels.cache.get(snoozeData.channel_id);
          }
          // For delete behavior, channel will be null and recreated when unsnoozed
        } else {
          // Normal thread
          channel = await this.bot.channels.cache.get(log.channel_id);
        }

        const thread = new Thread(this, recipient, channel);
        thread.logKey = log.id;
        thread.snoozed = log.snoozed || false;
        thread.snoozeData = log.snooze_data ? (typeof log.snooze_data === 'string' ? JSON.parse(log.snooze_data) : log.snooze_data) : null;

        // Schedule auto-unsnooze if snoozed
        if (thread.snoozed && thread.snoozeData && thread.snoozeData.snooze_until) {
          thread.scheduleUnsnooze(thread.snoozeData.snooze_until);
        }

        this.threads.set(recipient.id, thread);
      } catch (err) {
        logger.warn('Failed to restore thread from log', log.id, err);
      }
    }
    logger.info(`Restored ${this.threads.size} threads from database`);
  }
}

module.exports = { Thread, ThreadManager };