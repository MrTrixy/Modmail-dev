# Modmail JS

A JavaScript port of Modmail bot using Discord.js and SQLite.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your bot token:
   ```
   TOKEN=your_bot_token_here
   MODMAIL_GUILD_ID=your_guild_id
   ```

3. Run the bot:
   ```bash
   npm start
   ```

## Features

- DM to thread creation
- Thread management with slash commands
- SQLite database (no MongoDB required)
- Plugin system
- Basic modmail functionality

## Commands

### Modmail Commands
- `/reply <content> [anonymous]` - Reply to a thread
- `/close [reason] [silent]` - Close a thread
- `/note <content>` - Add a note to a thread
- `/logs <user>` - View user logs

### Utility Commands
- `/ping` - Check bot latency
- `/stats` - Show bot statistics

## Plugins

The bot supports a plugin system. Plugins are stored in the `plugins/` directory.

To enable a plugin, add it to the `plugins` config array.

Example plugin structure:
```
plugins/
  myplugin/
    index.js
```

## Differences from Python version

- Uses SQLite instead of MongoDB
- Slash commands instead of prefix commands
- Simplified configuration
- Plugin system is basic compared to Python version
- Some advanced features (snooze, complex permissions) not yet implemented

## Database Schema

The SQLite database contains:
- `logs` - Thread logs with messages
- `config` - Bot configuration
- `notes` - User notes
- `plugins` - Plugin data