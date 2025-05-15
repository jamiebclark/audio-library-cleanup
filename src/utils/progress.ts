import * as cliProgress from 'cli-progress';
import ora from 'ora';
import { log } from './logger';

// Track active progress bars and spinners to clean up on exit
const activeProgressBars: ProgressBar[] = [];
const activeSpinners: Spinner[] = [];

/**
 * Handles SIGINT (Ctrl+C) to gracefully clean up active progress indicators (spinners and progress bars)
 * before exiting the process. It ensures that all indicators are stopped to prevent them from
 * interfering with terminal output after the program has terminated.
 */
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
/**
 * Manages an Ora spinner for displaying progress of indeterminate tasks.
 * It handles starting, stopping, and updating the spinner text, as well as
 * managing its presence in a global list of active spinners for cleanup.
 */
export class Spinner {
  private spinner: ReturnType<typeof ora>;

  /**
   * Creates a new Spinner instance.
   * @param text - The initial text to display with the spinner.
   */
  constructor(text: string) {
    this.spinner = ora(text);
    activeSpinners.push(this);
  }

  /**
   * Starts the spinner.
   * @param text - Optional text to update the spinner with before starting.
   */
  start(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.start();
  }

  /**
   * Updates the spinner text.
   * @param text - The new text to display.
   */
  update(text: string): void {
    this.spinner.text = text;
  }

  /**
   * Stops the spinner and marks it as successful.
   * @param text - Optional text to display upon success.
   */
  succeed(text?: string): void {
    this.spinner.succeed(text);
    this.removeFromActiveList();
  }

  /**
   * Stops the spinner and marks it as failed.
   * @param text - Optional text to display upon failure.
   */
  fail(text?: string): void {
    this.spinner.fail(text);
    this.removeFromActiveList();
  }

  /**
   * Stops the spinner and marks it with a warning.
   * @param text - Optional text to display with the warning.
   */
  warn(text?: string): void {
    this.spinner.warn(text);
    this.removeFromActiveList();
  }

  /**
   * Stops the spinner and provides an informational message.
   * @param text - Optional text for the informational message.
   */
  info(text?: string): void {
    this.spinner.info(text);
    this.removeFromActiveList();
  }

  /**
   * Stops the spinner.
   * It attempts to stop gracefully and removes itself from the active list.
   */
  stop(): void {
    try {
      this.spinner.stop();
    } catch (error) {
      // Ignore errors when stopping spinners during cleanup
    }
    this.removeFromActiveList();
  }

  /**
   * Removes this spinner instance from the global list of active spinners.
   * This is typically called when the spinner is stopped or completes.
   */
  private removeFromActiveList(): void {
    const index = activeSpinners.indexOf(this);
    if (index !== -1) {
      activeSpinners.splice(index, 1);
    }
  }
}

/**
 * Generates a new Spinner instance or reuses an existing one.
 * If an existing spinner is provided, its text is updated and it's restarted.
 * Otherwise, a new spinner is created and started.
 * 
 * @param text - The text to display with the spinner.
 * @param existingSpinner - An optional existing Spinner instance to reuse.
 * @returns The new or reused Spinner instance.
 */
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
/**
 * Manages a cli-progress bar for displaying progress of determinate tasks.
 * It handles starting, stopping, and updating the progress bar, and manages
 * its presence in a global list of active progress bars for cleanup.
 */
export class ProgressBar {
  private bar: cliProgress.SingleBar;

  /**
   * Creates a new ProgressBar instance.
   * @param total - The total number of items to track.
   * @param startValue - The initial value of the progress bar (default: 0).
   * @param format - The format string for the progress bar (default: 'Progress: [{bar}] {percentage}% | {value}/{total} | {task}').
   */
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

  /**
   * Updates the progress bar to a specific value.
   * @param value - The new value for the progress bar.
   * @param payload - Optional data to update dynamic parts of the format string (e.g., { task: 'New Task' }).
   */
  update(value: number, payload?: { task?: string }): void {
    this.bar.update(value, payload);
  }

  /**
   * Increments the progress bar value.
   * @param amount - The amount to increment by (default: 1).
   * @param payload - Optional data to update dynamic parts of the format string.
   */
  increment(amount = 1, payload?: { task?: string }): void {
    this.bar.increment(amount, payload);
  }

  /**
   * Stops the progress bar.
   * It attempts to stop gracefully and removes itself from the active list.
   */
  stop(): void {
    try {
      this.bar.stop();
    } catch (error) {
      // Ignore errors when stopping progress bars during cleanup
    }
    this.removeFromActiveList();
  }

  /**
   * Removes this progress bar instance from the global list of active progress bars.
   * This is typically called when the progress bar is stopped.
   */
  private removeFromActiveList(): void {
    const index = activeProgressBars.indexOf(this);
    if (index !== -1) {
      activeProgressBars.splice(index, 1);
    }
  }
}

// Task group is a collection of tasks with a header
/**
 * Represents a group of tasks, each with its own spinner, under a common header.
 * It logs the header upon creation and manages the lifecycle of individual task spinners.
 */
export class TaskGroup {
  private taskCount: number = 0;
  private completedTasks: number = 0;
  private activeTaskSpinners: Spinner[] = [];

  /**
   * Creates a new TaskGroup instance.
   * @param name - The name of the task group, which will be displayed as a header.
   */
  constructor(private name: string) {
    log.console.header(name);
    log.header(name);
  }

  /**
   * Adds a new task to the group and starts its spinner.
   * @param taskName - The name of the task to add.
   * @returns The Ora spinner instance for the added task.
   */
  addTask(taskName: string): ReturnType<typeof ora> {
    this.taskCount++;
    const spinner = ora(taskName).start();
    const trackedSpinner = new Spinner(taskName);
    this.activeTaskSpinners.push(trackedSpinner);

    return spinner;
  }

  /**
   * Marks a task as completed and updates its spinner status.
   * @param spinner - The Ora spinner instance for the task being completed.
   * @param status - The completion status ('success', 'warning', 'error', 'info') (default: 'success').
   * @param text - Optional text to display with the completed spinner status.
   */
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

  /**
   * Gets a summary string of the task group's progress.
   * @returns A string like "Group Name: X/Y tasks completed".
   */
  getSummary(): string {
    return `${this.name}: ${this.completedTasks}/${this.taskCount} tasks completed`;
  }
} 