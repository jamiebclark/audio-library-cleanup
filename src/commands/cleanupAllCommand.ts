import { Command } from 'commander';
import { cleanupDirectories } from '../scripts/cleanupDirectories';
import { cleanupDuplicates } from '../scripts/cleanupDuplicates';
import { cleanupEmptyDirs } from '../scripts/cleanupEmptyDirs';
import { cleanupMp3Flac } from '../scripts/cleanupMp3Flac';
import { getCleanupInProgress, setCleanupInProgress, USER_INTERRUPTION_MESSAGE } from '../utils/cleanupState';
import { getAudioDirectory } from '../utils/config';
import { ProgressTracker } from '../utils/file';
import { log } from '../utils/logger';
import { generateSpinner, Spinner } from '../utils/progress';

// Gracefully handle Ctrl+C
process.on('SIGINT', () => {
  log.warning('\nGracefully shutting down... Please wait for the current operation to complete.');
  setCleanupInProgress(false);
  // Optionally, you might want to add a more forceful exit if it doesn't stop after a timeout
  // setTimeout(() => {
  //   log.error("Could not gracefully stop. Forcing exit.");
  //   process.exit(1);
  // }, 5000); // 5 second timeout
});

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
      setCleanupInProgress(true);
      // Create a shared spinner and progress tracker to reuse across all cleanup functions
      const spinner = new Spinner('Audio Library Cleanup');
      const progressTracker = new ProgressTracker(0, audioDir);
      progressTracker.clear();

      try {
        // Show dry run warning if applicable
        if (options.dryRun) {
          log.warning('Running in DRY RUN mode. No files will be modified.');
        }

        const cleanupTasks = [
          {
            name: 'Empty Directories Cleanup',
            skipCondition: options.skipEmptyDirs,
            func: cleanupEmptyDirs,
          },
          {
            name: 'Duplicate Files Cleanup',
            skipCondition: options.skipDuplicates,
            func: cleanupDuplicates,
          },
          {
            name: 'MP3/FLAC Cleanup',
            skipCondition: options.skipMp3Flac,
            func: cleanupMp3Flac,
          },
          {
            name: 'Similar Directory Name Cleanup',
            skipCondition: options.skipDirectories,
            func: cleanupDirectories,
          },
        ];

        for (const task of cleanupTasks) {
          if (!task.skipCondition && getCleanupInProgress()) {
            log.info(`Starting ${task.name}...`);
            await task.func(audioDir, options.dryRun, {
              spinner,
              progressTracker,
            });
            if (!getCleanupInProgress()) {
              log.info(`${task.name} was interrupted.`);
              break;
            }
            log.success(`${task.name} completed.`);
          } else if (task.skipCondition) {
            log.info(`Skipping ${task.name}.`);
          }
        }

        if (!getCleanupInProgress()) {
          log.info("Cleanup process was interrupted.");
        } else {
          log.success('\nCleanup complete!');
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === USER_INTERRUPTION_MESSAGE) {
            // The finally block will log that the process was interrupted.
            // No need for redundant logging here unless desired.
          } else {
            log.error(`An error occurred during cleanup: ${error.message}`);
          }
        } else {
          log.error('An unknown error occurred during cleanup');
        }
      } finally {
        spinner.succeed('Successfully completed cleanup');
        progressTracker.clear();
        setCleanupInProgress(true);
      }
    }
  });

export default program; 