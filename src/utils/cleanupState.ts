// src/utils/cleanupState.ts

let cleanupInProgressGlobal: boolean = true;
export const USER_INTERRUPTION_MESSAGE = "Cleanup process halted by user.";

/**
 * Sets the global cleanup progress state.
 * Call this with `false` to signal an interruption.
 * @param value - The new state for cleanup progress.
 */
export function setCleanupInProgress(value: boolean): void {
  cleanupInProgressGlobal = value;
}

/**
 * Gets the current global cleanup progress state.
 * @returns `true` if cleanup should continue, `false` if it has been interrupted.
 */
export function getCleanupInProgress(): boolean {
  return cleanupInProgressGlobal;
}

/**
 * Checks if cleanup is in progress and throws an error if it has been interrupted.
 * This is a utility to simplify interruption checks within loops.
 */
export function validateCleanupInProgress(): void {
  if (!cleanupInProgressGlobal) {
    throw new Error(USER_INTERRUPTION_MESSAGE);
  }
} 