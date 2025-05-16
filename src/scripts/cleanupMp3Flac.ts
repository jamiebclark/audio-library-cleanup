import * as path from 'path';
import { AudioFile, getAudioFilesInDirectory } from '../utils/audio';
import { validateCleanupInProgress } from '../utils/cleanupState';
import {
  deleteFile,
  normalizeForFuzzyMatching,
  SharedCleanupOptions
} from '../utils/file';
import { readableFileSize } from '../utils/format';
import { log } from '../utils/logger';
import { generateSpinner, ProgressBar } from '../utils/progress';
import { writeScriptResults } from '../utils/script';

/**
 * Cleans up MP3 files when a corresponding FLAC file exists in the same directory
 * with the same base name.
 *
 * @param directory - The root directory to scan.
 * @param dryRun - If true, only logs actions without performing them.
 * @param options - Shared cleanup options like spinner and progress tracker.
 */
export async function cleanupMp3Flac(
  directory: string,
  dryRun: boolean,
  options?: SharedCleanupOptions
) {
  log.console.header('Cleanup MP3/FLAC duplicates');
  const scanningSpinner = generateSpinner('Scanning for audio files', options?.spinner);
  const files = await getAudioFilesInDirectory(directory, options?.progressTracker, scanningSpinner);

  validateCleanupInProgress();

  // Group files by their parent directory path and then by base name
  const groupingSpinner = generateSpinner('Grouping files by directory and name', options?.spinner);

  const filesByDirectory = new Map<string, Map<string, AudioFile[]>>();

  files.forEach(file => {
    validateCleanupInProgress();
    const parentDir = path.dirname(file.path);
    const baseName = normalizeForFuzzyMatching(file.name.replace(/\(\d+\)$/, ''));

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

  groupingSpinner.succeed(`Grouped files across ${filesByDirectory.size} directories`);

  let totalMatchesFound = 0;
  let dirsWithMatches = 0;
  let changesCount = 0;

  // Create progress bar for processing directories
  const progressBar = new ProgressBar(filesByDirectory.size, 0, 'Checking directories: [{bar}] {percentage}% | {value}/{total} | {task}');
  let processedDirs = 0;

  // Process files by directory
  for (const [dirPath, dirMap] of filesByDirectory) {
    validateCleanupInProgress();
    const relativeDirPath = path.relative(directory, dirPath);
    let dirMatchesFound = false;

    // Update progress bar
    processedDirs++;
    progressBar.update(processedDirs, { task: `Checking ${relativeDirPath || '.'}` });

    for (const [baseName, fileGroup] of dirMap) {
      validateCleanupInProgress();
      const hasFlac = fileGroup.some(file => file.extension === '.flac');
      const mp3Files = fileGroup.filter(file => file.extension === '.mp3');

      if (hasFlac && mp3Files.length > 0) {
        if (!dirMatchesFound) {
          dirMatchesFound = true;
          dirsWithMatches++;
          log.subHeader(`Found MP3/FLAC matches in: ${relativeDirPath || '.'}`);
        }

        log.info(`MP3/FLAC versions for: ${baseName}`);
        totalMatchesFound++;

        for (const mp3File of mp3Files) {
          validateCleanupInProgress();
          if (dryRun) {
            log.dryRun(`Would delete MP3: ${path.basename(mp3File.path)} (${readableFileSize(mp3File.size)})`);
            changesCount++;
          } else {
            deleteFile(mp3File.path);
            changesCount++;
          }
        }
      }
    }
  }

  // Stop the progress bar
  progressBar.stop();

  if (totalMatchesFound === 0) {
    log.console.info('No MP3/FLAC matches found.');
  } else {
    log.console.result(`Found ${totalMatchesFound} MP3/FLAC matches across ${dirsWithMatches} directories.`);
  }

  // Write results to JSON file
  writeScriptResults('cleanupMp3Flac.ts', { mp3FilesDeleted: changesCount });
} 