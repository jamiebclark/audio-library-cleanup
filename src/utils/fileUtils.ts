import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { ProgressBar, Spinner } from './progress';

export interface AudioFile {
  path: string;
  name: string;
  size: number;
  extension: string;
}

export interface DirectoryInfo {
  path: string;
  name: string;
  subfolderCount: number;
  lastModified: Date;
  hasAccents: boolean;
}

export const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav'];

export function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

export function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

// Get total count of items to process (for progress calculation)
export function countItems(dirPath: string): number {
  let count = 0;
  try {
    const items = fs.readdirSync(dirPath);
    count += items.length;

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      if (fs.statSync(fullPath).isDirectory()) {
        count += countItems(fullPath);
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
    progressTracker?: { updateProgress: (currentPath: string) => void }
  }
) {
  // Try to get correct case path if the directory doesn't exist as provided
  if (!fs.existsSync(dirPath)) {
    const correctedPath = getCorrectCasePath(dirPath);

    // If the corrected path exists but is different from the original path, log the correction
    if (fs.existsSync(correctedPath) && correctedPath !== dirPath) {
      log.info(`Corrected path case: ${dirPath} → ${correctedPath}`);
      dirPath = correctedPath;
    } else {
      log.error(`Directory does not exist: ${dirPath}`);
      return;
    }
  }

  // Update progress if tracker is provided
  if (options?.progressTracker) {
    options.progressTracker.updateProgress(dirPath);
  }

  try {
    // Use withFileTypes to preserve original case
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      const isDirectory = entry.isDirectory();

      // Call the callback with the item
      callback(fullPath, isDirectory, stat);

      // Recursively traverse subdirectories
      if (isDirectory) {
        traverseDirectory(fullPath, callback, options);
      }
    }
  } catch (error) {
    log.error(`Error traversing directory ${dirPath}`);
  }
}

export function getAudioFilesInDirectory(dirPath: string): AudioFile[] {
  const files: AudioFile[] = [];

  // Add spinner for counting items
  const countingSpinner = new Spinner('Counting items to process');
  countingSpinner.start();

  const totalItems = countItems(dirPath);

  // Update spinner with count result
  countingSpinner.succeed(`Found ${totalItems} items to process`);

  const { updateProgress, clearProgress } = createProgressTracker(totalItems, dirPath);

  traverseDirectory(
    dirPath,
    (itemPath, isDirectory, stat) => {
      // Only process audio files, not directories
      if (!isDirectory && isAudioFile(path.basename(itemPath))) {
        files.push({
          path: itemPath,
          name: path.parse(itemPath).name,
          size: stat.size,
          extension: path.extname(itemPath).toLowerCase()
        });
      }
    },
    { progressTracker: { updateProgress } }
  );

  clearProgress();
  log.success('Scanning complete!');
  return files;
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

export function hasAudioFilesRecursive(dirPath: string): boolean {
  // Ensure we have the correct case path
  dirPath = getCorrectCasePath(dirPath);

  if (!fs.existsSync(dirPath)) {
    log.error(`Directory does not exist (in hasAudioFilesRecursive): ${dirPath}`);
    return false;
  }

  try {
    // First check if this directory itself has audio files
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const hasAudioInCurrentDir = entries.some(entry => {
      try {
        return !entry.isDirectory() && isAudioFile(entry.name);
      } catch (err) {
        return false;
      }
    });

    if (hasAudioInCurrentDir) {
      return true;
    }

    // Then check subdirectories
    // Convert to a set of lowercase names to detect duplicate folders with different casing
    const normalizedSubdirs = new Set<string>();
    const subdirMap: Record<string, string> = {};

    // Build a map of lowercase names to actual names
    for (const entry of entries) {
      try {
        if (entry.isDirectory()) {
          const lowerItem = entry.name.toLowerCase();
          normalizedSubdirs.add(lowerItem);
          subdirMap[lowerItem] = entry.name;
        }
      } catch (err) {
        // Skip items that can't be accessed
      }
    }

    // Check each unique subdirectory (ensures we don't miss due to case differences)
    for (const normalizedSubdir of normalizedSubdirs) {
      const actualSubdir = subdirMap[normalizedSubdir];
      const subdirPath = path.join(dirPath, actualSubdir);

      try {
        // Recursive check
        if (hasAudioFilesRecursive(subdirPath)) {
          return true;
        }
      } catch (err) {
        log.error(`Error checking subdirectory ${subdirPath}:`, err);
      }
    }
  } catch (err) {
    log.error(`Error reading directory ${dirPath}:`, err);
  }

  return false;
}

export function hasAudioFiles(dirPath: string): boolean {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.some(entry => !entry.isDirectory() && isAudioFile(entry.name));
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

// Create a progress tracker that returns functions to update and clear progress
export function createProgressTracker(totalItems: number, basePath: string) {
  let processedItems = 0;

  // Create a progress bar for scanning
  const progressBar = new ProgressBar(
    totalItems,
    0,
    'Scanning: [{bar}] {percentage}% | {value}/{total} | {task}'
  );

  const updateProgress = (currentPath: string) => {
    processedItems++;
    // Use relative path for cleaner output
    const relativePath = path.relative(basePath, currentPath) || '.';
    // Update the progress bar with current count and path
    progressBar.update(processedItems, { task: relativePath });
  };

  const clearProgress = () => {
    // Stop the progress bar (cleans up display)
    progressBar.stop();
  };

  return { updateProgress, clearProgress };
} 