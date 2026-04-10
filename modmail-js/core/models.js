const winston = require('winston');

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

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'modmail.log' })
  ]
});

function getLogger(name = 'Modmail') {
  return logger.child({ service: name });
}

function configureLogging(bot) {
  // Configure based on bot config if needed
  const logLevel = bot.config['log_level'] || 'info';
  logger.level = logLevel;
}

module.exports = {
  PermissionLevel,
  DMDisabled,
  HostingMethod,
  getLogger,
  configureLogging
};