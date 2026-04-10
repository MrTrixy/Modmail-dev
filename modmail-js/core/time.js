const { getLogger } = require('./models');

const logger = getLogger(__name__);

class Plural {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value === 1 ? `${this.value}` : `${this.value}`;
  }

  format(formatSpec) {
    const [singular, plural = `${singular}s`] = formatSpec.split('|');
    return Math.abs(this.value) === 1 ? `${this.value} ${singular}` : `${this.value} ${plural}`;
  }
}

function humanTimedelta(delta, *, accuracy = 3, brief = false, suffix = true) {
  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
    { name: 'second', seconds: 1 }
  ];

  const seconds = Math.abs(Math.floor(delta.totalSeconds ? delta.totalSeconds() : delta / 1000));
  if (seconds === 0) return 'now';

  const parts = [];
  for (const unit of units) {
    const count = Math.floor(seconds / unit.seconds);
    if (count > 0) {
      const name = brief ? unit.name[0] : unit.name;
      parts.push(`${count} ${name}${count !== 1 ? 's' : ''}`);
      if (parts.length >= accuracy) break;
    }
  }

  const result = parts.join(', ');
  return suffix ? `${result} ago` : result;
}

function formatRelative(dt) {
  const now = new Date();
  const diff = now - dt;
  return humanTimedelta(diff);
}

function parseDuration(duration) {
  // Simple duration parser (e.g., "1d", "2h", "30m")
  const regex = /(\d+)([smhdw])/g;
  let totalSeconds = 0;
  let match;

  while ((match = regex.exec(duration)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': totalSeconds += value; break;
      case 'm': totalSeconds += value * 60; break;
      case 'h': totalSeconds += value * 3600; break;
      case 'd': totalSeconds += value * 86400; break;
      case 'w': totalSeconds += value * 604800; break;
    }
  }

  return totalSeconds * 1000; // Return milliseconds
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const units = [
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
    { name: 'second', seconds: 1 }
  ];

  const parts = [];
  for (const unit of units) {
    const count = Math.floor(seconds / unit.seconds);
    if (count > 0) {
      parts.push(`${count} ${unit.name}${count !== 1 ? 's' : ''}`);
      seconds -= count * unit.seconds;
    }
  }

  return parts.join(', ') || '0 seconds';
}

module.exports = {
  Plural,
  humanTimedelta,
  formatRelative,
  parseDuration,
  formatDuration
};