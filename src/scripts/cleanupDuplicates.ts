import * as path from 'path';
import { AudioFile, getAudioFilesInDirectory } from '../utils/audio';
import { validateCleanupInProgress } from '../utils/cleanupState';
import {
  deleteFile,
  generateProgressTracker,
  renameFile,
  SharedCleanupOptions
} from '../utils/file';
import { readableFileSize } from '../utils/format';
import { log } from '../utils/logger';
import { generateSpinner, Spinner } from '../utils/progress';
import { writeScriptResults } from '../utils/script';

export async function cleanupDuplicates(
  directory: string,
  dryRun: boolean,
  options?: SharedCleanupOptions
) {
  log.console.header('Cleanup duplicates');

  const spinner = generateSpinner('Scanning for audio files', options?.spinner);
  const progressTracker = generateProgressTracker(0, directory, options?.progressTracker);
  const files = await getAudioFilesInDirectory(directory, progressTracker, spinner);

  validateCleanupInProgress();
  log.info(`Cleanup duplicates: Found ${files.length} audio files`);

  // Group files by their parent directory path and then by base name
  const filesByDirectory = new Map<string, Map<string, AudioFile[]>>();

  spinner.start('Grouping files by directory and name')

  files.forEach(file => {
    validateCleanupInProgress();
    const parentDir = path.dirname(file.path);
    const baseName = file.name.replace(/\(\d+\)$/, '').trim();

    // Create map for this directory if it doesn't exist
    if (!filesByDirectory.has(parentDir)) {
      filesByDirectory.set(parentDir, new Map<string, AudioFile[]>());
    }

    const dirMap = filesByDirectory.get(parentDir)!;

    // Create array for this base name if it doesn't exist
    if (!dirMap.has(baseName)) {
      dirMap.set(baseName, []);
    }

    // Add this file to the array for its directory and base name
    dirMap.get(baseName)!.push(file);
  });

  spinner.succeed(`Grouped files across ${filesByDirectory.size} directories`);
  log.info(`Grouped files across ${filesByDirectory.size} directories`);

  let totalDuplicatesFound = 0;
  let dirsWithDuplicates = 0;
  let duplicateFilesDeleted = 0;
  let filesRenamed = 0;

  // Create progress bar for processing directories
  progressTracker.clear().setTotalItems(filesByDirectory.size)
  let processedDirs = 0;

  // Process exact duplicates by directory
  for (const [dirPath, dirMap] of filesByDirectory) {
    validateCleanupInProgress();
    const relativeDirPath = path.relative(directory, dirPath);
    let dirDuplicatesFound = false;

    // Update progress bar
    processedDirs++;
    progressTracker.update(relativeDirPath);

    for (const [baseName, fileGroup] of dirMap) {
      validateCleanupInProgress();
      if (fileGroup.length > 1) {
        if (!dirDuplicatesFound) {
          dirDuplicatesFound = true;
          dirsWithDuplicates++;
        }

        log.subHeader(`Found duplicates in: ${relativeDirPath || '.'}`);
        log.info(`Duplicates for: ${baseName}`);
        totalDuplicatesFound++;

        // Sort by size (largest first)
        fileGroup.sort((a, b) => b.size - a.size);

        // Keep the largest file, delete others
        const [keepFile, ...deleteFiles] = fileGroup;

        log.success(`Keeping: ${path.basename(keepFile.path)} (${readableFileSize(keepFile.size)})`);

        for (const file of deleteFiles) {
          validateCleanupInProgress();
          if (dryRun) {
            log.dryRun(`Would delete: ${path.basename(file.path)} (${readableFileSize(file.size)})`);
            duplicateFilesDeleted++;
          } else {
            const deleteSpinner = new Spinner(`Deleting: ${path.basename(file.path)} (${readableFileSize(file.size)})`);
            deleteSpinner.start();
            deleteFile(file.path);
            deleteSpinner.succeed('Deleted');
            log.info(`Deleted: ${path.basename(file.path)} (${readableFileSize(file.size)})`);
            duplicateFilesDeleted++;
          }
        }

        // Check if the kept file has a numeric suffix and rename it AFTER deleting other files
        const numericSuffixMatch = keepFile.name.match(/(.+)\s+\((\d+)\)$/);
        if (numericSuffixMatch) {
          const baseName = numericSuffixMatch[1];
          const newFilePath = path.join(path.dirname(keepFile.path), `${baseName}${path.extname(keepFile.path)}`);

          if (dryRun) {
            log.dryRun(`Would rename: ${path.basename(keepFile.path)} → ${path.basename(newFilePath)}`);
            filesRenamed++;
          } else {
            const renameSpinner = new Spinner(`Renaming: ${path.basename(keepFile.path)} → ${path.basename(newFilePath)}`);
            renameSpinner.start();
            if (renameFile(keepFile.path, newFilePath)) {
              renameSpinner.succeed('Renamed');
              log.info(`Renamed: ${path.basename(keepFile.path)} → ${path.basename(newFilePath)}`);
              filesRenamed++;
            } else {
              renameSpinner.fail('Failed to rename');
              log.error(`Failed to rename: ${path.basename(keepFile.path)} → ${path.basename(newFilePath)}`);
            }
          }
        }
      }
    }
  }

  // Stop the progress bar
  progressTracker.clear();

  if (totalDuplicatesFound === 0) {
    log.console.info('No duplicates found.');
  } else {
    log.console.result(`Found ${totalDuplicatesFound} duplicate groups across ${dirsWithDuplicates} directories.`);
  }

  // Write results to JSON file
  writeScriptResults('cleanupDuplicates.ts', {
    duplicateFilesDeleted,
    filesRenamed
  });
} 