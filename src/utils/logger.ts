import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';

// Path to the log file
const logFilePath = path.resolve(process.cwd(), 'output.log');

// Clear the log file on startup
try {
  fs.writeFileSync(logFilePath, '');
} catch (error) {
  console.error('Failed to clear log file:', error);
}

// Configure winston logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: logFilePath }),
  ],
  silent: process.env.NODE_ENV === 'test',
});

// Export log functions with console color for progress bars only
export const log = {
  debug: (message: string) => {
    logger.debug(message);
  },
  info: (message: string) => {
    logger.info(message);
  },
  success: (message: string) => {
    logger.info(`SUCCESS: ${message}`);
  },
  warning: (message: string) => {
    logger.warn(message);
  },
  warn: (message: string) => {
    logger.warn(message);
  },
  error: (message: string, err?: any) => {
    logger.error(message);
    if (err) logger.error(JSON.stringify(err));
  },
  header: (message: string) => {
    logger.info(`\n\n\n\n=== ${message} ===\n\n`);
  },
  subHeader: (message: string) => {
    logger.info(message);
  },
  dryRun: (message: string) => {
    logger.info(`[DRY RUN] ${message}`);
  },
  result: (message: string) => {
    logger.info(`RESULT: ${message}`);
  },

  // Console methods for progress bars and spinners (these still go to console)
  console: {
    debug: (message: string) => console.log(chalk.gray(`DEBUG: ${message}`)),
    info: (message: string) => console.log(chalk.blue(`INFO: ${message}`)),
    success: (message: string) => console.log(chalk.green(`✓ ${message}`)),
    warning: (message: string) => console.log(chalk.yellow(`WARNING: ${message}`)),
    warn: (message: string) => console.log(chalk.yellow(`WARNING: ${message}`)),
    error: (message: string, err?: any) => {
      console.log(chalk.red(`ERROR: ${message}`));
      if (err) console.error(err);
    },
    header: (message: string) => console.log(chalk.bold.blue(`\n=== ${message} ===`)),
    subHeader: (message: string) => console.log(chalk.bold.cyan(`\n${message}`)),
    dryRun: (message: string) => console.log(chalk.magenta(`[DRY RUN] ${message}`)),
    result: (message: string) => console.log(chalk.green(`✓ ${message}`)),
  }
}; 