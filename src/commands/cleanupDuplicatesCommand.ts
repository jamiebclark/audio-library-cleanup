import { Command } from 'commander';
import { cleanupDuplicates } from '../scripts/cleanupDuplicates';
import { getAudioDirectory } from '../utils/config';
import { log } from '../utils/logger';
import { Spinner } from '../utils/progress';

const program = new Command();

program
  .name('cleanup-duplicates')
  .description('Find and remove duplicate audio files')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  /**
   * Action handler for the cleanup-duplicates command.
   * Retrieves the audio directory and calls the cleanupDuplicates script.
   *
   * @param directory - Optional directory path from the command line.
   * @param options - Command line options, including dryRun.
   */
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);
    log.info(`Using directory: ${audioDir}`);

    const spinner = new Spinner('Processing');
    await cleanupDuplicates(audioDir, options.dryRun, { spinner });
  });

export default program; 