import { Command } from 'commander';
import { cleanupDirectories } from '../scripts/cleanupDirectories';
import { cleanupDuplicates } from '../scripts/cleanupDuplicates';
import { cleanupEmptyDirs } from '../scripts/cleanupEmptyDirs';
import { cleanupMp3Flac } from '../scripts/cleanupMp3Flac';
import { getAudioDirectory } from '../utils/config';
import { ProgressTracker } from '../utils/fileUtils';
import { log } from '../utils/logger';
import { Spinner, generateSpinner } from '../utils/progress';

// Track whether cleanup is in progress
let cleanupInProgress = false;

const program = new Command();

program
  .name('audio-cleanup')
  .description('Clean up audio files in a directory')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  .option('--skip-duplicates', 'skip duplicate file cleanup')
  .option('--skip-mp3-flac', 'skip MP3/FLAC cleanup')
  .option('--skip-empty-dirs', 'skip empty directory cleanup')
  .option('--skip-directories', 'skip similar directory name cleanup')
  .action(async (directory: string | undefined, options: {
    dryRun: boolean,
    skipDuplicates: boolean,
    skipMp3Flac: boolean,
    skipEmptyDirs: boolean,
    skipDirectories: boolean
  }) => {
    const audioDir = getAudioDirectory(directory);
    log.info('Starting audio library cleanup...');

    // Create a initial spinner for directory setup
    const setupSpinner = generateSpinner(`Scanning directory: ${audioDir}`);

    // Wait a moment and mark this step as complete
    setTimeout(() => {
      setupSpinner.succeed(`Using directory: ${audioDir}`);
      runCleanupTasks();
    }, 500);

    // Main function to run all cleanup tasks
    async function runCleanupTasks() {
      cleanupInProgress = true;
      // Create a shared spinner and progress tracker to reuse across all cleanup functions
      const spinner = new Spinner('Audio Library Cleanup');
      const progressTracker = new ProgressTracker(0, audioDir);

      try {
        // Show dry run warning if applicable
        if (options.dryRun) {
          log.warning('Running in DRY RUN mode. No files will be modified.');
        }


        if (!options.skipDuplicates) {
          log.header('Checking for duplicate files');
          await cleanupDuplicates(audioDir, options.dryRun, { spinner, progressTracker });
        }

        if (!options.skipMp3Flac) {
          log.header('Checking for MP3/FLAC duplicates');
          await cleanupMp3Flac(audioDir, options.dryRun, { spinner });
        }

        if (!options.skipDirectories) {
          log.header('Checking for similar directory names');
          await cleanupDirectories(audioDir, options.dryRun, {
            spinner,
            progressTracker
          });
        }

        if (!options.skipEmptyDirs) {
          log.header('Checking for empty directories');
          await cleanupEmptyDirs(audioDir, options.dryRun, {
            spinner,
            progressTracker
          });
        }

        log.success('\nCleanup complete!');
      } catch (error) {
        if (error instanceof Error) {
          log.error(`An error occurred during cleanup: ${error.message}`);
        } else {
          log.error('An unknown error occurred during cleanup');
        }
      } finally {
        spinner.succeed('Successfully completed cleanup');
        progressTracker.clear();
        cleanupInProgress = false;
      }
    }
  });

export default program; 