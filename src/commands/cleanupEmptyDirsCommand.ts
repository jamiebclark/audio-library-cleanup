import { Command } from 'commander';
import { cleanupEmptyDirs } from '../scripts/cleanupEmptyDirs';
import { getAudioDirectory } from '../utils/config';
import { ProgressTracker } from '../utils/file';
import { log } from '../utils/logger';
import { Spinner } from '../utils/progress';

const program = new Command();

program
  .name('cleanup-empty-dirs')
  .description('Remove empty directories and directories without audio files')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  .option('-s, --skip-config <path>', 'path to a JSON file with directories to skip')
  /**
   * Action handler for the cleanup-empty-dirs command.
   * Retrieves the audio directory, sets skip config if provided, and calls the cleanupEmptyDirs script.
   *
   * @param directory - Optional directory path from the command line.
   * @param options - Command line options, including dryRun and skipConfig.
   */
  .action(async (directory: string | undefined, options: { dryRun: boolean, skipConfig?: string }) => {
    // Set environment variable if skip config is provided
    if (options.skipConfig) {
      process.env.SKIP_PATHS_CONFIG = options.skipConfig;
    }

    const audioDir = getAudioDirectory(directory);
    log.info(`Using directory: ${audioDir}`);

    // Create reusable spinner and progress tracker
    const spinner = new Spinner('Processing');
    const progressTracker = new ProgressTracker(0, audioDir);

    // Pass the shared components to the cleanup function
    await cleanupEmptyDirs(audioDir, options.dryRun, {
      spinner,
      progressTracker
    });
  });

export default program; 