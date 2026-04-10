const fs = require('fs');
const path = require('path');
const { getLogger } = require('./models');

const logger = getLogger(__name__);

class PluginManager {
  constructor(bot) {
    this.bot = bot;
    this.plugins = new Map();
    this.registry = {};
  }

  async loadPlugins() {
    const pluginsDir = path.join(__dirname, '..', 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir);
      logger.info('Created plugins directory');
      return;
    }

    // Load registry
    const registryPath = path.join(pluginsDir, 'registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        this.registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      } catch (error) {
        logger.error('Failed to load plugin registry', error);
      }
    }

    // Load enabled plugins
    const enabledPlugins = this.bot.config.get('plugins') || [];
    for (const pluginName of enabledPlugins) {
      await this.loadPlugin(pluginName);
    }

    logger.info(`Loaded ${this.plugins.size} plugins`);
  }

  async loadPlugin(pluginName) {
    try {
      const pluginPath = path.join(__dirname, '..', 'plugins', pluginName, 'index.js');
      if (!fs.existsSync(pluginPath)) {
        logger.warn(`Plugin ${pluginName} not found at ${pluginPath}`);
        return;
      }

      const PluginClass = require(pluginPath);
      const plugin = new PluginClass(this.bot);
      await plugin.init();
      this.plugins.set(pluginName, plugin);

      logger.info(`Loaded plugin: ${pluginName}`);
    } catch (error) {
      logger.error(`Failed to load plugin ${pluginName}`, error);
    }
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  async unloadPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (plugin && plugin.cleanup) {
      await plugin.cleanup();
    }
    this.plugins.delete(pluginName);
    logger.info(`Unloaded plugin: ${pluginName}`);
  }
}

module.exports = { PluginManager };