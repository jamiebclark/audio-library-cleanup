import { Command } from 'commander';
import { cleanupDirectories } from '../scripts/cleanupDirectories';
import { getAudioDirectory } from '../utils/config';
import { ProgressTracker } from '../utils/file';
import { Spinner, generateSpinner } from '../utils/progress';

const program = new Command();

program
  .name('cleanup-directories')
  .description('Clean up directories with similar names using fuzzy matching')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be merged without actually merging')
  /**
   * Action handler for the cleanup-directories command.
   * It retrieves the audio directory and then calls the cleanupDirectories script.
   *
   * @param directory - Optional directory path from the command line.
   * @param options - Command line options, including dryRun.
   */
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);

    const setupSpinner = generateSpinner(`Setting up for directory: ${audioDir}`);

    setTimeout(() => {
      setupSpinner.succeed(`Ready to scan directory: ${audioDir}`);
      const spinner = new Spinner('Audio Library Cleanup');
      const progressTracker = new ProgressTracker(0, audioDir);
      cleanupDirectories(audioDir, options.dryRun, {
        spinner,
        progressTracker
      });
    }, 500);
  });

export default program; 