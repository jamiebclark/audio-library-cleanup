import * as fs from 'fs';
import * as path from 'path';
import { validateCleanupInProgress } from './cleanupState';
import { countItems, generateProgressTracker, getCorrectCasePath, ProgressTracker, traverseDirectory } from './file';
import { log } from './logger';
import { generateSpinner, Spinner } from './progress';

export const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav'];

/**
 * Checks if a filename has a common audio file extension.
 * @param filename - The name of the file to check.
 * @returns True if the file is recognized as an audio file, false otherwise.
 */
export function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

// Define AudioFile interface here as it's closely related to audio file processing
export interface AudioFile {
  path: string;
  name: string;
  size: number;
  extension: string;
}

/**
 * Recursively finds all audio files in a directory and its subdirectories.
 * It uses a progress tracker and spinner to provide feedback during the scan.
 * 
 * @param dirPath - The root directory to scan for audio files.
 * @param useProgressTracker - Optional existing progress tracker to use.
 * @param useSpinner - Optional existing spinner to use.
 * @returns A promise that resolves to an array of AudioFile objects.
 */
export async function getAudioFilesInDirectory(dirPath: string, useProgressTracker?: ProgressTracker, useSpinner?: Spinner): Promise<AudioFile[]> {
  const files: AudioFile[] = [];

  const countingSpinner = generateSpinner('Counting items to process...', useSpinner);
  countingSpinner.start();

  validateCleanupInProgress();
  const totalItems = await countItems(dirPath, false);

  countingSpinner.succeed(`Get audio files: Found ${totalItems} items in directory, looking for audio files`);

  const progressTracker = generateProgressTracker(totalItems, dirPath, useProgressTracker);

  traverseDirectory(
    dirPath,
    (itemPath, isDirectory, stat) => {
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

  validateCleanupInProgress();
  progressTracker.clear();

  log.success(`Scanning complete! Found ${files.length} audio files.`);
  return files;
}

/**
 * Recursively checks if a directory or any of its subdirectories contain audio files.
 * It handles case-insensitive file systems by correcting path casing.
 * 
 * @param dirPath - The directory path to check.
 * @returns True if audio files are found, false otherwise.
 */
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

/**
 * Checks if a directory directly contains any audio files (non-recursive).
 * @param dirPath - The directory path to check.
 * @returns True if audio files are found directly in the directory, false otherwise.
 */
export function hasAudioFiles(dirPath: string): boolean {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.some(entry => !entry.isDirectory() && isAudioFile(entry.name));
} 