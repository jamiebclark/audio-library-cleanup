import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Path to the log file
const outputDir = path.join(process.cwd(), 'output', 'logs');
const logFilePath = path.join(outputDir, 'output.log');

// Ensure output directory exists
try {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
} catch (error) {
  console.error('Failed to setup logs directory:', error);
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
    new DailyRotateFile({
      filename: path.join(outputDir, 'output-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '5m',
      maxFiles: '5d',
      zippedArchive: true
    })
  ],
  silent: process.env.NODE_ENV === 'test',
});

// Export log functions with console color for progress bars only
const baseLog = {
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
  }
} as const;

function consoleLog(key: keyof typeof baseLog, message: string, formattedMessage: string) {
  console.log(formattedMessage);
  baseLog[key](message);
}

// Console methods for progress bars and spinners (these still go to console)
const outputConsole = {
  debug: (message: string) => consoleLog('debug', message, chalk.gray(`DEBUG: ${message}`)),
  info: (message: string) => consoleLog('info', message, chalk.blue(`INFO: ${message}`)),
  success: (message: string) => consoleLog('success', message, chalk.green(`✓ ${message}`)),
  warning: (message: string) => consoleLog('warning', message, chalk.yellow(`WARNING: ${message}`)),
  warn: (message: string) => consoleLog('warn', message, chalk.yellow(`WARNING: ${message}`)),
  error: (message: string, err?: any) => {
    consoleLog('error', message, chalk.red(`ERROR: ${message}`));
    if (err) console.error(err);
  },
  header: (message: string) => consoleLog('header', message, chalk.bold.blue(`\n=== ${message} ===`)),
  subHeader: (message: string) => consoleLog('subHeader', message, chalk.bold.cyan(`\n${message}`)),
  dryRun: (message: string) => consoleLog('dryRun', message, chalk.magenta(`[DRY RUN] ${message}`)),
  result: (message: string) => consoleLog('result', message, chalk.green(`✓ ${message}`)),
} as const;


export const log = { ...baseLog, console: outputConsole };