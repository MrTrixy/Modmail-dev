require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { ConfigManager } = require('./core/config');
const { SQLiteClient } = require('./core/clients');
const { ThreadManager } = require('./core/thread');
const { getLogger, configureLogging } = require('./core/models');
const { ModmailCommands } = require('./cogs/modmail');
const { UtilityCommands } = require('./cogs/utility');
const { PluginManager } = require('./core/plugins');

const logger = getLogger('index');

class ModmailBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.config = new ConfigManager(this);
    this.config.populateCache();

    this.api = new SQLiteClient(this);
    this.threads = new ThreadManager(this);
    this.modmail = new ModmailCommands(this);
    this.utility = new UtilityCommands(this);
    this.plugins = new PluginManager(this);

    this.once('ready', this.onReady.bind(this));
    this.on('messageCreate', this.onMessage.bind(this));
    this.on('interactionCreate', this.onInteraction.bind(this));
  }

  get guild() {
    // Return the first guild for backwards compatibility
    return this.guilds.cache.first();
  }

  get guildId() {
    // Return the first guild ID for backwards compatibility
    return this.guilds.cache.first()?.id;
  }

  getGuild(guildId) {
    return this.guilds.cache.get(guildId);
  }

  async onReady() {
    logger.info(`Logged in as ${this.user.tag}`);

    // Connect to DB
    await this.api.connect();
    await this.api.validateDatabaseConnection();
    await this.api.setupIndexes();

    // Refresh config from DB
    await this.config.refresh();

    // Configure logging
    configureLogging(this);

    // Populate thread cache
    await this.threads.populateCache();

    // Load plugins
    await this.plugins.loadPlugins();

    // Register slash commands
    await this.registerCommands();

    logger.info('Bot is ready');
  }

  async registerCommands() {
    const modmailCommands = this.modmail.getCommands();
    const utilityCommands = this.utility.getCommands();
    const commands = [...modmailCommands, ...utilityCommands];
    const rest = new REST({ version: '10' }).setToken(this.config.get('token'));

    try {
      logger.info('Started refreshing application (/) commands.');

      // Register commands globally
      await rest.put(
        Routes.applicationCommands(this.user.id),
        { body: commands }
      );

      logger.info('Successfully reloaded application (/) commands globally.');
    } catch (error) {
      logger.error('Error registering commands', error);
    }
  }

  async onInteraction(interaction) {
    if (!interaction.isCommand()) return;

    const modmailCommands = ['reply', 'close', 'note', 'logs', 'snooze', 'unsnooze'];
    const utilityCommands = ['ping', 'stats'];

    if (modmailCommands.includes(interaction.commandName)) {
      await this.modmail.handleCommand(interaction);
    } else if (utilityCommands.includes(interaction.commandName)) {
      await this.utility.handleCommand(interaction);
    } else {
      await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    }
  }

  async onMessage(message) {
    if (message.author.bot) return;

    if (message.guild) {
      // Message in guild - handle thread replies
      await this.handleGuildMessage(message);
    } else {
      // DM - create or find thread
      await this.handleDM(message);
    }
  }

  async handleDM(message) {
    // Check if blocked, etc. (simplified)

    // Find or create thread
    let thread = await this.threads.find(message.author);

    // If thread is snoozed, unsnooze it first
    if (thread.snoozed) {
      await thread.unsnooze();
    }

    // Send message to thread
    await thread.send(message);

    // Send confirmation to user
    const embed = {
      description: this.config.get('thread_creation_response'),
      color: this.config.get('main_color'),
      footer: { text: this.config.get('thread_creation_footer') },
      timestamp: new Date()
    };

    await message.author.send({ embeds: [embed] });
  }

  async handleGuildMessage(message) {
    // Check if it's a thread channel
    const log = await this.api.getLog(message.channel.id);
    if (!log) return;

    // It's a thread message
    const thread = this.threads.threads.get(log.recipient.id);
    if (!thread) return;

    // Send to recipient
    await thread.reply(message.content);
  }

  async login(token) {
    await this.api.connect();
    return super.login(token || this.config.get('token'));
  }

  async destroy() {
    await this.api.close();
    return super.destroy();
  }
}

// Start bot
const bot = new ModmailBot();
bot.login().catch(console.error);