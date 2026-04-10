// Test script for the new picocolors logging system
const { getLogger, configureLogging } = require('./core/models');

console.log('Testing picocolors logging system...\n');

// Create a test logger
const logger = getLogger('test');

// Test different log levels
logger.error('This is an error message');
logger.warn('This is a warning message');
logger.info('This is an info message');
logger.debug('This is a debug message');

// Test child logger
const childLogger = getLogger('child');
childLogger.info('This is from a child logger');

// Test configureLogging (mock bot object)
const mockBot = {
  config: {
    get: (key) => key === 'log_level' ? 'debug' : 'info'
  }
};
configureLogging(mockBot);

console.log('\nAfter configuring with debug level:');
logger.debug('This debug message should now appear');
logger.info('This info message should still appear');

console.log('\nTest completed!');