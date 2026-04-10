const { EmbedBuilder } = require('discord.js');
const { getLogger } = require('../core/models');
const { formatDuration } = require('../core/time');

const logger = getLogger(__name__);

class UtilityCommands {
  constructor(bot) {
    this.bot = bot;
  }

  async ping(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(this.bot.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle('Pong! 🏓')
      .addFields(
        { name: 'Bot Latency', value: `${latency}ms`, inline: true },
        { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
        { name: 'Uptime', value: formatDuration(this.bot.uptime), inline: true }
      )
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  }

  async stats(interaction) {
    const guilds = this.bot.guilds.cache.size;
    const users = this.bot.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const channels = this.bot.channels.cache.size;
    const threads = this.bot.threads.threads.size;

    const embed = new EmbedBuilder()
      .setTitle('Bot Statistics')
      .addFields(
        { name: 'Servers', value: guilds.toString(), inline: true },
        { name: 'Users', value: users.toString(), inline: true },
        { name: 'Channels', value: channels.toString(), inline: true },
        { name: 'Active Threads', value: threads.toString(), inline: true },
        { name: 'Uptime', value: formatDuration(this.bot.uptime), inline: true },
        { name: 'Database', value: 'SQLite', inline: true }
      )
      .setColor(this.bot.config.get('main_color'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  getCommands() {
    return [
      {
        name: 'ping',
        description: 'Check bot latency and uptime'
      },
      {
        name: 'stats',
        description: 'Show bot statistics'
      }
    ];
  }

  async handleCommand(interaction) {
    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'ping':
          await this.ping(interaction);
          break;
        case 'stats':
          await this.stats(interaction);
          break;
        default:
          await interaction.reply({ content: 'Unknown utility command.', ephemeral: true });
      }
    } catch (error) {
      logger.error(`Error handling utility command ${commandName}`, error);
      await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
  }
}

module.exports = { UtilityCommands };