import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { generateSpinner, ProgressBar, Spinner } from './progress';

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
export function countItems(dirPath: string, onlyDirectories: boolean = false): number {
  const isDirectory = fs.statSync(dirPath).isDirectory();
  let count = 0;
  try {
    const items = fs.readdirSync(dirPath);
    if (onlyDirectories) {
      count += isDirectory ? 1 : 0;
    } else {
      count += items.length;
    }

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      if (fs.statSync(fullPath).isDirectory()) {
        count += countItems(fullPath, onlyDirectories);
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
  options?.progressTracker?.update(dirPath);


  try {
    // Use withFileTypes to preserve original case
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      const isDirectory = entry.isDirectory();


      // Call the callback with the item
      callback(fullPath, isDirectory, stat);

      if (!options?.countDirectories || isDirectory) {
        options?.progressTracker?.update(fullPath);
      }

      // Recursively traverse subdirectories
      if (isDirectory) {
        traverseDirectory(fullPath, callback, options);
      }
    }
  } catch (error) {
    log.error(`Error traversing directory ${dirPath}`);
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
export class ProgressTracker {
  private processedItems: number = 0;
  private progressBar!: ProgressBar;
  private basePath: string;

  constructor(totalItems: number, basePath: string) {
    this.basePath = basePath;
    this.setTotalItems(totalItems);
  }

  update(currentPath: string): void {
    this.processedItems++;
    // Use relative path for cleaner output
    const relativePath = path.relative(this.basePath, currentPath) || '.';
    // Update the progress bar with current count and path
    this.progressBar.update(this.processedItems, { task: relativePath });
  }

  clear(): void {
    // Stop the progress bar (cleans up display)
    this.progressBar.stop();
    this.processedItems = 0;
  }

  setTotalItems(totalItems: number): void {
    this.progressBar = new ProgressBar(
      totalItems,
      this.processedItems,
      'Scanning: [{bar}] {percentage}% | {value}/{total} | {task}'
    );
  }

  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }
}

export function getAudioFilesInDirectory(dirPath: string, useProgressTracker?: ProgressTracker, useSpinner?: Spinner): AudioFile[] {
  const files: AudioFile[] = [];

  // Add spinner for counting items
  const countingSpinner = generateSpinner('Counting items to process', useSpinner);
  countingSpinner.start();

  const totalItems = countItems(dirPath, false);

  // Update spinner with count result
  countingSpinner.succeed(`Get audio files: Found ${totalItems} files in directory, looking for audio files`);

  const progressTracker = generateProgressTracker(totalItems, dirPath, useProgressTracker);

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
    { progressTracker }
  );

  countingSpinner.succeed(`Found ${files.length} audio files`);
  progressTracker.clear();
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

export function writeScriptResults(scriptName: string, resultsData: Record<string, number>): void {
  const outputDir = path.join('output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get the filename from the scriptName (e.g. cleanupDirectories.ts -> cleanupDirectories)
  const baseName = path.basename(scriptName, '.ts');
  const outputFileName = `${baseName}.json`;
  const outputFilePath = path.join(outputDir, outputFileName);
  fs.writeFileSync(outputFilePath, JSON.stringify(resultsData, null, 2));
  log.info(`Results saved to ${outputFilePath}`);
}