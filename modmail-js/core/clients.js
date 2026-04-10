const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const { getLogger } = require('./models');

const logger = getLogger(__name__);

class SQLiteClient {
  constructor(dbPath = './modmail.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error(`Failed to connect to database: ${err.message}`);
          reject(err);
        } else {
          logger.info('Connected to SQLite database');
          this.initTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async initTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        open INTEGER DEFAULT 1,
        created_at TEXT,
        closed_at TEXT,
        channel_id TEXT,
        guild_id TEXT,
        bot_id TEXT,
        recipient TEXT,
        closer TEXT,
        messages TEXT,
        snoozed INTEGER DEFAULT 0,
        snooze_data TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS config (
        id TEXT,
        guild_id TEXT,
        data TEXT,
        PRIMARY KEY (id, guild_id)
      )`,
      `CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_id TEXT,
        author TEXT,
        message TEXT,
        message_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS plugins (
        plugin_name TEXT,
        data TEXT,
        PRIMARY KEY (plugin_name)
      )`
    ];

    for (const query of queries) {
      await this.run(query);
    }

    // Create indexes
    await this.run(`CREATE INDEX IF NOT EXISTS idx_logs_recipient ON logs(recipient)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_logs_channel ON logs(channel_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_logs_open ON logs(open)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_notes_recipient ON notes(recipient_id)`);

    logger.info('Database tables initialized');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async setupIndexes() {
    // SQLite FTS for search
    await this.run(`CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
      content, author_name, key, content='logs', content_rowid='rowid'
    )`);

    // Populate FTS table
    await this.run(`INSERT OR IGNORE INTO logs_fts(rowid, content, author_name, key)
      SELECT rowid, 
             json_extract(messages, '$[*].content'),
             json_extract(messages, '$[*].author.name'),
             id
      FROM logs`);

    logger.info('FTS indexes set up');
  }

  async validateDatabaseConnection() {
    try {
      await this.get('SELECT 1');
      logger.info('Database connection validated');
    } catch (err) {
      logger.error(`Database validation failed: ${err.message}`);
      throw err;
    }
  }

  // Logs methods
  async getUserLogs(userId) {
    const rows = await this.all(
      'SELECT * FROM logs WHERE json_extract(recipient, "$.id") = ? AND guild_id = ? ORDER BY created_at DESC LIMIT 5',
      [userId, this.bot.guildId]
    );
    return rows.map(row => ({
      ...row,
      recipient: JSON.parse(row.recipient),
      messages: JSON.parse(row.messages || '[]'),
      snooze_data: row.snooze_data ? JSON.parse(row.snooze_data) : null
    }));
  }

  async findLogEntry(key) {
    const row = await this.get('SELECT * FROM logs WHERE id = ?', [key]);
    if (!row) return [];
    return [{
      ...row,
      recipient: JSON.parse(row.recipient),
      messages: JSON.parse(row.messages || '[]').slice(0, 5),
      snooze_data: row.snooze_data ? JSON.parse(row.snooze_data) : null
    }];
  }

  async getLatestUserLogs(userId) {
    const row = await this.get(
      'SELECT * FROM logs WHERE json_extract(recipient, "$.id") = ? AND guild_id = ? AND open = 0 ORDER BY closed_at DESC LIMIT 1',
      [userId, this.bot.guildId]
    );
    if (!row) return null;
    return {
      ...row,
      recipient: JSON.parse(row.recipient),
      messages: JSON.parse(row.messages || '[]').slice(0, 5),
      snooze_data: row.snooze_data ? JSON.parse(row.snooze_data) : null
    };
  }

  async getRespondedLogs(userId) {
    // This is complex, simplified version
    const rows = await this.all(
      'SELECT * FROM logs WHERE open = 0 AND json_extract(messages, "$[*].author.id") LIKE ?',
      [`%${userId}%`]
    );
    return rows.map(row => ({
      ...row,
      recipient: JSON.parse(row.recipient),
      messages: JSON.parse(row.messages || '[]'),
      snooze_data: row.snooze_data ? JSON.parse(row.snooze_data) : null
    }));
  }

  async getOpenLogs() {
    const rows = await this.all('SELECT * FROM logs WHERE open = 1');
    return rows.map(row => ({
      ...row,
      recipient: JSON.parse(row.recipient),
      messages: JSON.parse(row.messages || '[]'),
      snooze_data: row.snooze_data ? JSON.parse(row.snooze_data) : null
    }));
  }

  async getLog(channelId) {
    const row = await this.get('SELECT * FROM logs WHERE channel_id = ?', [channelId]);
    if (!row) return null;
    return {
      ...row,
      recipient: JSON.parse(row.recipient),
      messages: JSON.parse(row.messages || '[]'),
      snooze_data: row.snooze_data ? JSON.parse(row.snooze_data) : null
    };
  }

  async createLogEntry(recipient, channel, creator) {
    const key = Math.random().toString(36).substring(2, 8);
    const now = new Date().toISOString();

    await this.run(
      `INSERT INTO logs (id, open, created_at, channel_id, guild_id, bot_id, recipient, messages)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
      [
        key,
        now,
        channel.id.toString(),
        this.bot.guildId.toString(),
        this.bot.user.id.toString(),
        JSON.stringify({
          id: recipient.id.toString(),
          name: recipient.username,
          discriminator: recipient.discriminator,
          avatar_url: recipient.displayAvatarURL()
        }),
        JSON.stringify([])
      ]
    );

    return key;
  }

  async appendLog(message, messageId = '', channelId = '', type_ = 'thread_message') {
    const log = await this.getLog(channelId || message.channel.id);
    if (!log) return null;

    const messages = log.messages || [];
    messages.push({
      timestamp: message.createdTimestamp,
      message_id: messageId || message.id,
      author: {
        id: message.author.id.toString(),
        name: message.author.username,
        discriminator: message.author.discriminator,
        avatar_url: message.author.displayAvatarURL(),
        mod: message.author.bot || false // Simplified
      },
      content: message.content,
      type: type_,
      attachments: message.attachments.map(a => ({
        id: a.id,
        filename: a.name,
        url: a.url,
        size: a.size
      }))
    });

    await this.run(
      'UPDATE logs SET messages = ? WHERE id = ?',
      [JSON.stringify(messages), log.id]
    );

    return log;
  }

  async postLog(channelId, data) {
    // Simplified, just update the log
    await this.run(
      'UPDATE logs SET messages = ?, open = 0, closed_at = ? WHERE channel_id = ?',
      [JSON.stringify(data.messages), new Date().toISOString(), channelId]
    );
    return data;
  }

  async deleteLogEntry(key) {
    const result = await this.run('DELETE FROM logs WHERE id = ?', [key]);
    return result.changes > 0;
  }

  // Config methods
  async getConfig(guildId = null) {
    const whereClause = guildId ? 'WHERE guild_id = ?' : 'WHERE guild_id IS NULL';
    const params = guildId ? [guildId] : [];
    const row = await this.get(`SELECT data FROM config ${whereClause} ORDER BY id LIMIT 1`, params);
    return row ? JSON.parse(row.data) : {};
  }

  async updateConfig(data, guildId = null) {
    const id = guildId ? `guild_${guildId}` : 'global';
    await this.run(
      'INSERT OR REPLACE INTO config (id, guild_id, data) VALUES (?, ?, ?)',
      [id, guildId, JSON.stringify(data)]
    );
  }

  // Notes methods
  async createNote(recipient, message, messageId) {
    await this.run(
      'INSERT INTO notes (recipient_id, author, message, message_id) VALUES (?, ?, ?, ?)',
      [
        recipient.id.toString(),
        JSON.stringify({
          id: message.author.id.toString(),
          name: message.author.username
        }),
        message.content,
        messageId
      ]
    );
  }

  async findNotes(recipient) {
    const rows = await this.all('SELECT * FROM notes WHERE recipient_id = ?', [recipient.id]);
    return rows.map(row => ({
      ...row,
      author: JSON.parse(row.author)
    }));
  }

  async deleteNote(messageId) {
    await this.run('DELETE FROM notes WHERE message_id = ?', [messageId]);
  }

  async editNote(messageId, newMessage) {
    await this.run('UPDATE notes SET message = ? WHERE message_id = ?', [newMessage, messageId]);
  }

  // Plugin methods
  getPluginPartition(pluginName) {
    return {
      get: async () => {
        const row = await this.get('SELECT data FROM plugins WHERE plugin_name = ?', [pluginName]);
        return row ? JSON.parse(row.data) : {};
      },
      set: async (data) => {
        await this.run(
          'INSERT OR REPLACE INTO plugins (plugin_name, data) VALUES (?, ?)',
          [pluginName, JSON.stringify(data)]
        );
      }
    };
  }

  async close() {
    if (this.db) {
      await new Promise((resolve) => {
        this.db.close((err) => {
          if (err) logger.error(`Error closing database: ${err.message}`);
          resolve();
        });
      });
    }
  }
}

module.exports = { SQLiteClient };