const pc = require('picocolors');
const fs = require('fs');

class PermissionLevel {
  static OWNER = 5;
  static ADMINISTRATOR = 4;
  static ADMIN = 4;
  static MODERATOR = 3;
  static MOD = 3;
  static SUPPORTER = 2;
  static RESPONDER = 2;
  static REGULAR = 1;
  static INVALID = -1;
}

class DMDisabled {
  static NONE = 0;
  static NEW_THREADS = 1;
  static ALL_THREADS = 2;
}

class HostingMethod {
  static HEROKU = 0;
  static PM2 = 1;
  static SYSTEMD = 2;
  static SCREEN = 3;
  static DOCKER = 4;
  static OTHER = 5;
}

class Logger {
  constructor(name = 'Modmail') {
    this.name = name;
    this.level = 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.levelNames = {
      0: 'error',
      1: 'warn',
      2: 'info',
      3: 'debug'
    };
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = level;
    } else if (typeof level === 'number') {
      this.level = this.levelNames[level] || 'info';
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    const coloredLevel = this.colorLevel(level);
    const coloredName = pc.cyan(`[${this.name}]`);
    return `${pc.gray(timestamp)} ${coloredLevel} ${coloredName} ${message}`;
  }

  colorLevel(level) {
    switch (level) {
      case 'error': return pc.red('ERROR');
      case 'warn': return pc.yellow('WARN');
      case 'info': return pc.blue('INFO');
      case 'debug': return pc.gray('DEBUG');
      default: return level;
    }
  }

  log(level, message) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message);
    console.log(formatted);

    // Also write to file
    this.writeToFile(formatted);
  }

  writeToFile(message) {
    const logEntry = message + '\n';
    fs.appendFile('modmail.log', logEntry, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }

  error(message) {
    this.log('error', message);
  }

  warn(message) {
    this.log('warn', message);
  }

  warning(message) {
    this.warn(message);
  }

  info(message) {
    this.log('info', message);
  }

  debug(message) {
    this.log('debug', message);
  }

  child(options) {
    const childLogger = new Logger(options.service || this.name);
    childLogger.level = this.level;
    return childLogger;
  }
}

const logger = new Logger();

function getLogger(name = 'Modmail') {
  return logger.child({ service: name });
}

function configureLogging(bot) {
  // Configure based on bot config if needed
  const logLevel = bot.config.get('log_level') || 'info';
  logger.setLevel(logLevel);
}
  logger.level = logLevel;
}

module.exports = {
  PermissionLevel,
  DMDisabled,
  HostingMethod,
  getLogger,
  configureLogging
};