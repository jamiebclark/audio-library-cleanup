import * as cliProgress from 'cli-progress';
import ora from 'ora';
import { log } from './logger';

// Track active progress bars and spinners to clean up on exit
const activeProgressBars: ProgressBar[] = [];
const activeSpinners: Spinner[] = [];

// Handle graceful cleanup and exit when Ctrl-C is pressed
process.on('SIGINT', () => {
  log.console.warning('\nInterrupted by user. Cleaning up...');
  log.warning('Interrupted by user. Cleaning up...');

  // Clean up all active progress bars
  for (const bar of [...activeProgressBars]) {
    try {
      bar.stop();
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Clean up all active spinners
  for (const spinner of [...activeSpinners]) {
    try {
      spinner.stop();
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Log completion of cleanup
  log.console.info('Cleanup complete. Exiting...');
  log.info('Cleanup complete. Exiting...');

  // Allow any final console outputs to complete before exiting
  setTimeout(() => {
    process.exit(130); // 130 is the standard exit code for Ctrl-C
  }, 100);
});

// Ora spinner for indeterminate tasks
export class Spinner {
  private spinner: ReturnType<typeof ora>;

  constructor(text: string) {
    this.spinner = ora(text);
    activeSpinners.push(this);
  }

  start(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.start();
  }

  update(text: string): void {
    this.spinner.text = text;
  }

  succeed(text?: string): void {
    this.spinner.succeed(text);
    this.removeFromActiveList();
  }

  fail(text?: string): void {
    this.spinner.fail(text);
    this.removeFromActiveList();
  }

  warn(text?: string): void {
    this.spinner.warn(text);
    this.removeFromActiveList();
  }

  info(text?: string): void {
    this.spinner.info(text);
    this.removeFromActiveList();
  }

  stop(): void {
    try {
      this.spinner.stop();
    } catch (error) {
      // Ignore errors when stopping spinners during cleanup
    }
    this.removeFromActiveList();
  }

  private removeFromActiveList(): void {
    const index = activeSpinners.indexOf(this);
    if (index !== -1) {
      activeSpinners.splice(index, 1);
    }
  }
}

// Utility function to generate or reuse a spinner with updated text
export function generateSpinner(text: string, existingSpinner?: Spinner): Spinner {
  if (existingSpinner) {
    existingSpinner.start(text);
    return existingSpinner;
  } else {
    const spinner = new Spinner(text);
    spinner.start();
    return spinner;
  }
}

// Progress bar for determinate tasks
export class ProgressBar {
  private bar: cliProgress.SingleBar;

  constructor(total: number, startValue = 0, format = 'Progress: [{bar}] {percentage}% | {value}/{total} | {task}') {
    this.bar = new cliProgress.SingleBar({
      format,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    this.bar.start(total, startValue, {
      task: 'Processing'
    });

    activeProgressBars.push(this);
  }

  update(value: number, payload?: { task?: string }): void {
    this.bar.update(value, payload);
  }

  increment(amount = 1, payload?: { task?: string }): void {
    this.bar.increment(amount, payload);
  }

  stop(): void {
    try {
      this.bar.stop();
    } catch (error) {
      // Ignore errors when stopping progress bars during cleanup
    }
    this.removeFromActiveList();
  }

  private removeFromActiveList(): void {
    const index = activeProgressBars.indexOf(this);
    if (index !== -1) {
      activeProgressBars.splice(index, 1);
    }
  }
}

// Task group is a collection of tasks with a header
export class TaskGroup {
  private taskCount: number = 0;
  private completedTasks: number = 0;
  private activeTaskSpinners: Spinner[] = [];

  constructor(private name: string) {
    log.console.header(name);
    log.header(name);
  }

  addTask(taskName: string): ReturnType<typeof ora> {
    this.taskCount++;
    const spinner = ora(taskName).start();
    const trackedSpinner = new Spinner(taskName);
    this.activeTaskSpinners.push(trackedSpinner);

    return spinner;
  }

  completeTask(spinner: ReturnType<typeof ora>, status: 'success' | 'warning' | 'error' | 'info' = 'success', text?: string): void {
    this.completedTasks++;

    switch (status) {
      case 'success':
        spinner.succeed(text);
        break;
      case 'warning':
        spinner.warn(text);
        break;
      case 'error':
        spinner.fail(text);
        break;
      case 'info':
        spinner.info(text);
        break;
    }

    // Remove the completed spinner from our tracking
    if (this.activeTaskSpinners.length > 0) {
      this.activeTaskSpinners.pop();
    }
  }

  getSummary(): string {
    return `${this.name}: ${this.completedTasks}/${this.taskCount} tasks completed`;
  }
} 