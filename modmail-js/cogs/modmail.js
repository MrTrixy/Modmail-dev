const { CommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getLogger } = require('../core/models');
const { createNotFoundEmbed } = require('../core/utils');
const { parseDuration } = require('../core/time');

const logger = getLogger('modmail');

class ModmailCommands {
  constructor(bot) {
    this.bot = bot;
  }

  async reply(interaction, content, anonymous = false) {
    const thread = await this.findThreadFromChannel(interaction.channel);
    if (!thread) {
      return await interaction.reply({ content: 'This is not a modmail thread.', ephemeral: true });
    }

    await thread.reply(content, anonymous);

    const embed = new EmbedBuilder()
      .setDescription(anonymous ? 'Anonymous reply sent.' : 'Reply sent.')
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  async close(interaction, reason = null, silent = false) {
    const thread = await this.findThreadFromChannel(interaction.channel);
    if (!thread) {
      return await interaction.reply({ content: 'This is not a modmail thread.', ephemeral: true });
    }

    await thread.close(interaction.user, silent);

    const embed = new EmbedBuilder()
      .setTitle('Thread Closed')
      .setDescription(reason ? `Reason: ${reason}` : 'Thread has been closed.')
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  async note(interaction, content) {
    const thread = await this.findThreadFromChannel(interaction.channel);
    if (!thread) {
      return await interaction.reply({ content: 'This is not a modmail thread.', ephemeral: true });
    }

    await this.bot.api.createNote(thread.recipient, interaction.user, content);

    const embed = new EmbedBuilder()
      .setTitle('Note Added')
      .setDescription(`Note: ${content}`)
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  async snooze(interaction, duration = null) {
    const thread = await this.findThreadFromChannel(interaction.channel);
    if (!thread) {
      return await interaction.reply({ content: 'This is not a modmail thread.', ephemeral: true });
    }

    if (thread.snoozed) {
      return await interaction.reply({ content: 'This thread is already snoozed.', ephemeral: true });
    }

    try {
      const parsedDuration = duration ? parseDuration(duration) : null;
      await thread.snooze(parsedDuration);
      const embed = new EmbedBuilder()
        .setTitle('Thread Snoozed')
        .setDescription('The thread has been snoozed successfully.')
        .setColor(this.bot.config.get('main_color'))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to snooze thread', error);
      await interaction.reply({ content: 'Failed to snooze thread.', ephemeral: true });
    }
  }

  async unsnooze(interaction) {
    const thread = await this.findThreadFromChannel(interaction.channel);
    if (!thread) {
      return await interaction.reply({ content: 'This is not a modmail thread.', ephemeral: true });
    }

    if (!thread.snoozed) {
      return await interaction.reply({ content: 'This thread is not snoozed.', ephemeral: true });
    }

    try {
      await thread.unsnooze();
      const embed = new EmbedBuilder()
        .setTitle('Thread Unsnoozed')
        .setDescription('The thread has been unsnoozed successfully.')
        .setColor(this.bot.config.get('main_color'))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to unsnooze thread', error);
      await interaction.reply({ content: 'Failed to unsnooze thread.', ephemeral: true });
    }
  }

  async logs(interaction, user) {
    try {
      const logs = await this.bot.api.getUserLogs(user.id);
      
      if (!logs || logs.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('No Logs Found')
          .setDescription(`No modmail logs found for ${user.username}.`)
          .setColor(this.bot.config.get('error_color'))
          .setTimestamp();
        return await interaction.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle(`Modmail Logs for ${user.username}`)
        .setDescription(`Found ${logs.length} log entries.`)
        .setColor(this.bot.config.get('main_color'))
        .setTimestamp();

      // Add summary of recent logs
      const recentLogs = logs.slice(-5); // Last 5 logs
      let logSummary = '';
      for (const log of recentLogs) {
        const date = new Date(log.created_at).toLocaleDateString();
        logSummary += `${date}: ${log.open ? 'Open' : 'Closed'}\n`;
      }
      embed.addFields({ name: 'Recent Activity', value: logSummary || 'No recent activity' });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to get logs', error);
      await interaction.reply({ content: 'Failed to retrieve logs.', ephemeral: true });
    }
  }

  async findThreadFromChannel(channel) {
    const log = await this.bot.api.getLog(channel.id);
    if (!log) return null;

    return this.bot.threads.threads.get(log.recipient.id);
  }

  getCommands() {
    return [
      {
        name: 'reply',
        description: 'Reply to a modmail thread',
        options: [
          {
            name: 'content',
            type: 3, // STRING
            description: 'The reply content',
            required: true
          },
          {
            name: 'anonymous',
            type: 5, // BOOLEAN
            description: 'Send anonymously',
            required: false
          }
        ]
      },
      {
        name: 'close',
        description: 'Close a modmail thread',
        options: [
          {
            name: 'reason',
            type: 3, // STRING
            description: 'Reason for closing',
            required: false
          },
          {
            name: 'silent',
            type: 5, // BOOLEAN
            description: 'Close silently',
            required: false
          }
        ]
      },
      {
        name: 'note',
        description: 'Add a note to a thread',
        options: [
          {
            name: 'content',
            type: 3, // STRING
            description: 'The note content',
            required: true
          }
        ]
      },
      {
        name: 'logs',
        description: 'View logs for a user',
        options: [
          {
            name: 'user',
            type: 6, // USER
            description: 'The user to view logs for',
            required: true
          }
        ]
      },
      {
        name: 'snooze',
        description: 'Snooze a modmail thread',
        options: [
          {
            name: 'duration',
            type: 3, // STRING
            description: 'Duration to snooze (e.g., 1d, 2h, 30m)',
            required: false
          }
        ]
      },
      {
        name: 'unsnooze',
        description: 'Unsnooze a modmail thread'
      }
    ];
  }

  async handleCommand(interaction) {
    const { commandName, options } = interaction;

    try {
      switch (commandName) {
        case 'reply':
          const content = options.getString('content');
          const anonymous = options.getBoolean('anonymous') || false;
          await this.reply(interaction, content, anonymous);
          break;
        case 'close':
          const reason = options.getString('reason');
          const silent = options.getBoolean('silent') || false;
          await this.close(interaction, reason, silent);
          break;
        case 'note':
          const noteContent = options.getString('content');
          await this.note(interaction, noteContent);
          break;
        case 'logs':
          const user = options.getUser('user');
          await this.logs(interaction, user);
          break;
        case 'snooze':
          const duration = options.getString('duration');
          await this.snooze(interaction, duration);
          break;
        case 'unsnooze':
          await this.unsnooze(interaction);
          break;
        default:
          await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      }
    } catch (error) {
      logger.error(`Error handling command ${commandName}`, error);
      await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
  }
}

module.exports = { ModmailCommands };