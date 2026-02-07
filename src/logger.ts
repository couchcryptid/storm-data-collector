import pino from 'pino';
import chalk from 'chalk';

/**
 * Create a Pino logger instance configured for the application
 * Includes structured logging with ISO timestamps and color support via pino-pretty
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
      timeFormat: 'HH:mm:ss Z',
      // Custom color scheme
      colors: {
        50: 'bgRed', // fatal
        40: 'red', // error
        30: 'yellow', // warn
        20: 'green', // info
        10: 'blue', // debug
      },
    },
  },
});

/**
 * Utility functions for colored console output (used for startup messages)
 * These complement pino for non-structured output
 */
export const styled = {
  success: (message: string) => chalk.green(message),
  info: (message: string) => chalk.blue(message),
  warning: (message: string) => chalk.yellow(message),
  error: (message: string) => chalk.red(message),
  highlight: (message: string) => chalk.cyan(message),
  bold: (message: string) => chalk.bold(message),
  dim: (message: string) => chalk.dim(message),
  success_bold: (message: string) => chalk.bold.green(message),
  error_bold: (message: string) => chalk.bold.red(message),
};

/**
 * Print styled section headers for configuration display
 */
export function printHeader(title: string): void {
  const padding = Math.max(0, (50 - title.length) / 2);
  console.log(chalk.bold.cyan(`\n${'═'.repeat(60)}`));
  console.log(chalk.bold.cyan(`${' '.repeat(Math.floor(padding))}${title}`));
  console.log(chalk.bold.cyan(`${'═'.repeat(60)}\n`));
}

/**
 * Print a styled configuration item
 */
export function printConfig(key: string, value: string | boolean): void {
  const formattedValue =
    typeof value === 'boolean'
      ? value
        ? chalk.green('✓ Enabled')
        : chalk.red('✗ Disabled')
      : chalk.cyan(value);
  console.log(`  ${chalk.dim(key)}: ${formattedValue}`);
}

/**
 * Print a section divider
 */
export function printDivider(): void {
  console.log(chalk.dim('─'.repeat(60)));
}

/**
 * Print startup success message
 */
export function printStartupSuccess(message: string): void {
  console.log(`\n${chalk.bold.green('✓')} ${chalk.bold.green(message)}\n`);
}

/**
 * Print startup error message
 */
export function printStartupError(message: string): void {
  console.log(`\n${chalk.bold.red('✗')} ${chalk.bold.red(message)}\n`);
}

export default logger;
