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

export function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

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

export function deleteFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

export function deleteDirectory(dirPath: string): void {
  fs.rmdirSync(dirPath, { recursive: true });
}

export function renameFile(oldPath: string, newPath: string): boolean {
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (error) {
    log.error(`Error renaming file from ${oldPath} to ${newPath}:`, error);
    return false;
  }
}

export function normalizeForFuzzyMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasAccents(text: string): boolean {
  return /[\u0300-\u036f]/.test(text) ||
    text.normalize('NFD').length !== text.normalize('NFC').length;
}

export function getSubfolderCount(dirPath: string): number {
  try {
    return fs.readdirSync(dirPath)
      .filter(item => fs.statSync(path.join(dirPath, item)).isDirectory())
      .length;
  } catch (error) {
    return 0;
  }
}

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
 * Finds case-insensitive matching siblings for a directory
 * @param dirPath The directory path to check
 * @returns Array of sibling paths that match case-insensitively (empty if no matches)
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
 * Checks if a directory is truly empty (no files or subdirectories)
 * @param dirPath Directory to check
 * @returns true if directory is completely empty
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

export function generateProgressTracker(totalItems: number, basePath: string, existingTracker?: ProgressTracker): ProgressTracker {
  if (existingTracker) {
    existingTracker.clear();
    existingTracker.setTotalItems(totalItems);
    existingTracker.setBasePath(basePath);
    return existingTracker;
  }
  return new ProgressTracker(totalItems, basePath);
} 