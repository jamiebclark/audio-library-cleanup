import * as fs from 'fs';
import * as path from 'path';
import { validateCleanupInProgress } from './cleanupState';
import { log } from './logger';
import { ProgressBar, Spinner } from './progress';

export interface SharedCleanupOptions {
  spinner?: Spinner;
  progressTracker?: ProgressTracker;
}

export interface DirectoryInfo {
  path: string;
  name: string;
  subfolderCount: number;
  lastModified: Date;
  hasAccents: boolean;
}

/**
 * Gets the size of a file in bytes.
 * @param filePath - The path to the file.
 * @returns The size of the file in bytes.
 */
export function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

/**
 * Recursively counts items (files and directories, or just directories) in a given directory path.
 * Silently handles errors like permission issues for subdirectories.
 * @param dirPath - The path to the directory.
 * @param onlyDirectories - If true, counts only directories. Otherwise, counts all items.
 * @returns A promise that resolves to the total count of items.
 */
// Get total count of items to process (for progress calculation)
export async function countItems(dirPath: string, onlyDirectories: boolean = false): Promise<number> {
  validateCleanupInProgress();
  const isDirectory = (await fs.promises.stat(dirPath)).isDirectory();
  let count = 0;
  try {
    const items = await fs.promises.readdir(dirPath);
    if (onlyDirectories) {
      count += isDirectory ? 1 : 0;
    } else {
      count += items.length;
    }

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      if ((await fs.promises.stat(fullPath)).isDirectory()) {
        validateCleanupInProgress();
        count += await countItems(fullPath, onlyDirectories);
      }
    }
  } catch (error) {
    // Silently handle errors (permission issues, etc.)
  }
  return count;
}

/**
 * Traverses a directory recursively with case-sensitivity correction and progress tracking
 * 
 * @param dirPath The directory to traverse
 * @param callback Function called for each item found (both files and directories)
 * @param options Options for traversal including progress tracking
 */
export function traverseDirectory(
  dirPath: string,
  callback: (itemPath: string, isDirectory: boolean, stat: fs.Stats) => void,
  options?: {
    progressTracker?: ProgressTracker,
    countDirectories?: boolean
  }
) {
  // Try to get correct case path if the directory doesn't exist as provided
  if (!fs.existsSync(dirPath)) {
    const correctedPath = getCorrectCasePath(dirPath);

    if (fs.existsSync(correctedPath) && correctedPath !== dirPath) {
      log.info(`Corrected path case: ${dirPath} → ${correctedPath}`);
      dirPath = correctedPath;
    } else {
      log.error(`Directory does not exist: ${dirPath}`);
      return;
    }
  }

  // Update progress if tracker is provided
  options?.progressTracker?.update(dirPath);

  // Check cleanup status
  validateCleanupInProgress();

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      const isDirectory = entry.isDirectory();

      validateCleanupInProgress();
      callback(fullPath, isDirectory, stat);

      if (isDirectory) {
        traverseDirectory(fullPath, callback, options);
        validateCleanupInProgress();
      } else if (!options?.countDirectories) {
        // If not counting directories, update progress for files
        options?.progressTracker?.update(fullPath);
      }
    }
  } catch (error) {
    log.error(`Error traversing directory ${dirPath}`);
  }
}

/**
 * Checks if a directory is empty.
 * It corrects the case of the directory path before checking.
 * @param dirPath - The path to the directory.
 * @returns True if the directory is empty, false otherwise or if an error occurs.
 */
export function isDirectoryEmpty(dirPath: string): boolean {
  // Ensure we have the correct case path
  dirPath = getCorrectCasePath(dirPath);

  if (!fs.existsSync(dirPath)) {
    log.error(`Directory does not exist (in isDirectoryEmpty): ${dirPath}`);
    return false;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.length === 0;
  } catch (err) {
    log.error(`Error checking if directory is empty: ${dirPath}`, err);
    return false;
  }
}

/**
 * Deletes a file.
 * @param filePath - The path to the file to delete.
 */
export function deleteFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

/**
 * Deletes a directory recursively.
 * @param dirPath - The path to the directory to delete.
 */
export function deleteDirectory(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Renames a file.
 * @param oldPath - The current path of the file.
 * @param newPath - The new path for the file.
 * @returns True if renaming was successful, false otherwise.
 */
export function renameFile(oldPath: string, newPath: string): boolean {
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (error) {
    log.error(`Error renaming file from ${oldPath} to ${newPath}:`, error);
    return false;
  }
}

/**
 * Normalizes a string for fuzzy matching.
 * Converts to lowercase, removes accents, replaces ampersands with "and",
 * and trims/normalizes whitespace.
 * @param text - The string to normalize.
 * @returns The normalized string.
 */
export function normalizeForFuzzyMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a string contains accented characters.
 * @param text - The string to check.
 * @returns True if the string contains accents, false otherwise.
 */
export function hasAccents(text: string): boolean {
  return /[\u0300-\u036f]/.test(text) ||
    text.normalize('NFD').length !== text.normalize('NFC').length;
}

/**
 * Gets the number of subfolders in a directory.
 * @param dirPath - The path to the directory.
 * @returns The number of subfolders, or 0 if an error occurs.
 */
export function getSubfolderCount(dirPath: string): number {
  try {
    return fs.readdirSync(dirPath)
      .filter(item => fs.statSync(path.join(dirPath, item)).isDirectory())
      .length;
  } catch (error) {
    return 0;
  }
}

/**
 * Gets the last modified date of a directory.
 * @param dirPath - The path to the directory.
 * @returns The last modified date, or epoch (1970-01-01) if an error occurs.
 */
export function getDirectoryLastModified(dirPath: string): Date {
  try {
    return fs.statSync(dirPath).mtime;
  } catch (error) {
    return new Date(0);
  }
}

/**
 * Attempts to find the correct case for a path that might have case mismatches
 * Works on both case-sensitive and case-insensitive file systems
 * 
 * @param pathToCheck The path to check and potentially correct
 * @returns The path with correct case if found, or the original path
 */
export function getCorrectCasePath(pathToCheck: string): string {
  // If the path exists as-is, no need to do anything
  if (fs.existsSync(pathToCheck)) {
    return pathToCheck;
  }

  // Split path into segments
  const parts = pathToCheck.split(path.sep);
  let currentPath = '';

  // Root drive or share
  if (parts[0].endsWith(':')) {
    currentPath = parts[0] + path.sep;
    parts.shift();
  } else if (parts[0] === '') {
    // For absolute paths starting with /
    currentPath = path.sep;
    parts.shift();

    if (parts.length > 0 && parts[0] === '') {
      // Handle UNC paths (\\server\share)
      currentPath += path.sep;
      parts.shift();
    }
  }

  // Build the path segment by segment with correct case
  for (const segment of parts) {
    if (!segment) continue;

    try {
      // Use withFileTypes to preserve original case of filenames
      const dirEntries = fs.readdirSync(currentPath || '.', { withFileTypes: true });

      // Find a matching entry (case-insensitive comparison)
      const matchingEntry = dirEntries.find(entry =>
        entry.name.toLowerCase() === segment.toLowerCase()
      );

      if (matchingEntry) {
        // Use the exact case from the filesystem
        currentPath = path.join(currentPath, matchingEntry.name);
      } else {
        // If we can't find a matching segment, append the original segment
        // and accept that the path may not exist
        currentPath = path.join(currentPath, segment);
      }
    } catch (err) {
      // If we can't read the directory, just append the original segment
      currentPath = path.join(currentPath, segment);
    }
  }

  return currentPath;
}

/**
 * Renames a directory.
 * @param oldPath - The current path of the directory.
 * @param newPath - The new path for the directory.
 * @returns True if renaming was successful, false otherwise.
 */
export function renameDirectory(oldPath: string, newPath: string): boolean {
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (error) {
    log.error(`Error renaming directory from ${oldPath} to ${newPath}:`, error);
    return false;
  }
}

/**
 * Finds sibling directories that differ only by case from the given directory path.
 * For example, if dirPath is "/path/to/Folder", it might find "/path/to/folder".
 * @param dirPath - The path to the directory to check for case-insensitive siblings.
 * @returns An array of paths for sibling directories that are case-insensitive matches.
 */
export function findCaseInsensitiveSiblings(dirPath: string): string[] {
  const dirName = path.basename(dirPath);
  const parentDir = path.dirname(dirPath);
  const siblings: string[] = [];

  try {
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });

    // Find directories that match case-insensitively but not exactly
    for (const entry of entries) {
      if (entry.isDirectory() &&
        entry.name.toLowerCase() === dirName.toLowerCase() &&
        entry.name !== dirName) {
        siblings.push(path.join(parentDir, entry.name));
      }
    }
  } catch (err) {
    log.error(`Error finding case-insensitive siblings for ${dirPath}:`, err);
  }

  return siblings;
}

/**
 * Checks if a directory is truly empty (contains no files and no non-empty subdirectories).
 * This is a more thorough check than isDirectoryEmpty, which only checks for immediate children.
 * @param dirPath - The path to the directory.
 * @returns True if the directory is truly empty, false otherwise.
 */
export function isDirectoryTrulyEmpty(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.length === 0;
  } catch (err) {
    log.error(`Error checking if directory is truly empty: ${dirPath}`, err);
    return false;
  }
}

// Restoring ProgressTracker and generateProgressTracker
export class ProgressTracker {
  private processedItems: number = 0;
  private progressBar!: ProgressBar; // Uses ProgressBar from ./progress
  private basePath: string;

  constructor(totalItems: number, basePath: string) {
    this.basePath = basePath;
    this.setTotalItems(totalItems);
  }

  update(currentPath: string): ProgressTracker {
    this.processedItems++;
    const relativePath = path.relative(this.basePath, currentPath) || '.';
    this.progressBar.update(this.processedItems, { task: relativePath });
    return this;
  }

  clear(): ProgressTracker {
    this.progressBar.stop();
    this.processedItems = 0;
    return this;
  }

  setTotalItems(totalItems: number): ProgressTracker {
    this.progressBar = new ProgressBar(
      totalItems,
      this.processedItems,
      'Scanning: [{bar}] {percentage}% | {value}/{total} | {task}'
    );
    return this;
  }

  setBasePath(basePath: string): ProgressTracker {
    this.basePath = basePath;
    return this;
  }
}

/**
 * Generates a ProgressTracker instance.
 * If an existing tracker is provided, it updates its total items and base path.
 * Otherwise, it creates a new ProgressTracker.
 *
 * @param totalItems - The total number of items for the progress tracker.
 * @param basePath - The base path for normalizing displayed paths.
 * @param existingTracker - An optional existing ProgressTracker to update.
 * @returns The existing (updated) or new ProgressTracker instance.
 */
export function generateProgressTracker(totalItems: number, basePath: string, existingTracker?: ProgressTracker): ProgressTracker {
  if (existingTracker) {
    existingTracker.clear();
    existingTracker.setTotalItems(totalItems);
    existingTracker.setBasePath(basePath);
    return existingTracker;
  }
  return new ProgressTracker(totalItems, basePath);
} 