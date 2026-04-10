const { getLogger } = require('../../core/models');

const logger = getLogger('ExamplePlugin');

class ExamplePlugin {
  constructor(bot) {
    this.bot = bot;
  }

  async init() {
    logger.info('Example plugin initialized');
    // Add event listeners or custom functionality here
  }

  async cleanup() {
    logger.info('Example plugin cleaned up');
  }

  // Example method
  async onThreadCreate(thread) {
    logger.info(`Thread created for user ${thread.recipient.username}`);
  }
}

module.exports = ExamplePlugin;