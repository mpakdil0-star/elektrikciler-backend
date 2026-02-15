import { config } from '../config/env';

const logLevels = ['error', 'warn', 'info', 'debug'] as const;
type LogLevel = typeof logLevels[number];

class Logger {
  private logLevel: LogLevel = 'info';

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = logLevels.slice(0, logLevels.indexOf(this.logLevel) + 1);
    return levels.includes(level);
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  error(message: string, error?: Error | any) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, error?.stack || error));
    }
  }

  warn(message: string, meta?: any) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  info(message: string, meta?: any) {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, meta));
    }
  }

  debug(message: string, meta?: any) {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }
}

export const logger = new Logger();

