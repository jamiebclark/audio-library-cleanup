import * as fs from 'fs';
import * as path from 'path';
import { getPathsToSkip } from '../utils/config';
import {
  countItems,
  deleteDirectory,
  findCaseInsensitiveSiblings,
  generateProgressTracker,
  isDirectoryTrulyEmpty,
  ProgressTracker,
  renameDirectory,
  traverseDirectory,
  writeScriptResults
} from '../utils/fileUtils';
import { getFileName } from '../utils/formatUtils';
import { log } from '../utils/logger';
import { generateSpinner, Spinner } from '../utils/progress';

interface CleanupOptions {
  force?: boolean;
  spinner?: Spinner;
  progressTracker?: ProgressTracker;
}

/**
 * Handles checking and cleanup of directories with case-sensitivity issues
 * @returns true if directory was deleted, false otherwise
 */
async function handleCaseSensitiveDirectory(
  dirPath: string,
  dryRun: boolean
): Promise<boolean> {
  const siblings = findCaseInsensitiveSiblings(dirPath);
  if (siblings.length === 0) return false;

  const dirName = path.basename(dirPath);
  const caseDuplicatePrefix = '-CASE-DUPLICATE-';
  const renamedPaths = new Map<string, string>(); // original -> renamed mapping

  log.warn(`Found case-sensitive duplicate directories for: ${dirName}`);
  log.info(`  Original: ${dirName}`);
  siblings.forEach(s => log.info(`  Sibling: ${path.basename(s)}`));

  if (dryRun) {
    // Just log what would happen
    log.dryRun(`Would rename ${dirName} and ${siblings.length} sibling(s) to ensure unique names before checking emptiness`);
    siblings.forEach((siblingPath, index) => {
      log.dryRun(`  Would rename: ${path.basename(siblingPath)} → ${path.basename(siblingPath)}${caseDuplicatePrefix}${index + 1}`);
    });
    return false;
  }

  try {
    // Step 1: Rename all siblings (including original) to ensure unique names
    const allPaths = [dirPath, ...siblings];
    for (let i = 0; i < allPaths.length; i++) {
      const currentPath = allPaths[i];
      const currentName = path.basename(currentPath);
      const newName = `${currentName}${caseDuplicatePrefix}${i + 1}`;
      const newPath = path.join(path.dirname(currentPath), newName);

      log.info(`Renaming for uniqueness: ${currentName} → ${newName}`);
      if (renameDirectory(currentPath, newPath)) {
        renamedPaths.set(currentPath, newPath);
      } else {
        log.error(`Failed to rename ${currentName} - skipping this group`);

        // Rollback any renames we've done so far
        for (const [origPath, tempPath] of renamedPaths.entries()) {
          if (fs.existsSync(tempPath)) {
            log.info(`Rolling back rename: ${path.basename(tempPath)} → ${path.basename(origPath)}`);
            renameDirectory(tempPath, origPath);
          }
        }
        return false;
      }
    }

    // Step 2: Now that all paths are unique, check for and delete empty directories
    const deletedPaths = new Set<string>();
    for (const [origPath, tempPath] of renamedPaths.entries()) {
      if (fs.existsSync(tempPath) && isDirectoryTrulyEmpty(tempPath)) {
        log.info(`Deleting empty directory: ${path.basename(tempPath)}`);
        deleteDirectory(tempPath);
        deletedPaths.add(origPath);
      }
    }

    // Step 3: Rename remaining directories back to their original names
    for (const [origPath, tempPath] of renamedPaths.entries()) {
      if (!deletedPaths.has(origPath) && fs.existsSync(tempPath)) {
        log.info(`Restoring original name: ${path.basename(tempPath)} → ${path.basename(origPath)}`);
        if (!renameDirectory(tempPath, origPath)) {
          log.error(`Failed to restore original name for ${path.basename(tempPath)}`);
        }
      }
    }

    return deletedPaths.has(dirPath);
  } catch (error) {
    log.error(`Error handling case-sensitive directories: ${error}`);

    // Attempt to clean up any renamed directories
    for (const [origPath, tempPath] of renamedPaths.entries()) {
      if (fs.existsSync(tempPath)) {
        log.info(`Attempting to restore: ${path.basename(tempPath)} → ${path.basename(origPath)}`);
        renameDirectory(tempPath, origPath);
      }
    }

    return false;
  }
}

export async function cleanupEmptyDirs(
  directory: string,
  dryRun: boolean,
  options: CleanupOptions = {}
) {
  const emptyDirs: string[] = [];
  const errorDirs: string[] = [];
  const skippedDirs: Set<string> = new Set();
  let changesCount = 0;

  // Use provided spinner or create a new one
  const countingSpinner = generateSpinner('Cleanup empty directories: Counting items to process', options?.spinner);

  const totalItems = countItems(directory, true);

  countingSpinner.succeed(`Cleanup empty directories: Found ${totalItems} directories to process`);

  // Use provided progress tracker or create a new one
  const progressTracker = generateProgressTracker(totalItems, directory, options?.progressTracker);

  // Get user-configured paths to skip from config
  const configuredSkipPaths = getPathsToSkip(directory);
  if (configuredSkipPaths.length > 0) {
    log.info(`Loaded ${configuredSkipPaths.length} paths to skip from configuration`);
  }

  // First pass: collect directory paths to check later
  const dirsToCheck: string[] = [];

  traverseDirectory(
    directory,
    (itemPath, isDirectory) => {
      if (isDirectory) {
        dirsToCheck.push(itemPath);
      }
    },
    { progressTracker, countDirectories: true }
  );

  progressTracker.clear();
  log.success('Initial scan complete!');

  // Sort by path length in descending order to check deepest directories first
  dirsToCheck.sort((a, b) => b.length - a.length);

  // Process directories
  progressTracker.setTotalItems(dirsToCheck.length);

  for (const dirPath of dirsToCheck) {
    try {
      progressTracker.update(dirPath);

      // Skip if this path or any parent is in the user-configured skip list
      const shouldSkipFromConfig = configuredSkipPaths.some(skipPath =>
        dirPath.toLowerCase() === skipPath.toLowerCase() ||
        dirPath.toLowerCase().startsWith(skipPath.toLowerCase() + path.sep)
      );

      if (shouldSkipFromConfig) {
        skippedDirs.add(dirPath);
        continue;
      }

      // First handle any case sensitivity issues
      const wasDeletedByHandler = await handleCaseSensitiveDirectory(dirPath, dryRun);
      if (wasDeletedByHandler) {
        changesCount++;
        continue;
      }

      // If directory still exists and is empty, mark it for deletion
      if (fs.existsSync(dirPath) && isDirectoryTrulyEmpty(dirPath)) {
        emptyDirs.push(dirPath);
      }
    } catch (error) {
      log.error(`Error checking directory: ${dirPath}`, error);
      errorDirs.push(dirPath);
    }
  }

  // Process empty directories
  if (emptyDirs.length > 0) {
    log.console.result(`${emptyDirs.length} empty directories found:`);
    for (const dir of emptyDirs) {
      if (dryRun) {
        log.dryRun(`Would delete empty directory: ${getFileName(dir)}`);
        changesCount++;
      } else {
        deleteDirectory(dir);
        log.success(`Deleted empty directory: ${getFileName(dir)}`);
        changesCount++;
      }
    }
  }

  // Report errors
  if (errorDirs.length > 0) {
    log.warn('WARNING: Some directories had errors:');
    for (const dir of errorDirs) {
      log.info(`  - ${getFileName(dir)}`);
    }
  }

  // Report skipped directories
  if (skippedDirs.size > 0) {
    log.console.warn(`${skippedDirs.size} skipped directories:`);
    for (const dir of skippedDirs) {
      log.info(`  - ${getFileName(dir)}`);
    }
  }

  if (emptyDirs.length === 0) {
    log.console.info('No empty directories found.');
  }

  // Clear progress at the end
  progressTracker.clear();

  writeScriptResults('cleanupEmptyDirs.ts', { emptyDirectoriesDeletedOrIdentified: changesCount });
}