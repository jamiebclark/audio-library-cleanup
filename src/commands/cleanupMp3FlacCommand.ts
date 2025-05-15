import { Command } from 'commander';
import { cleanupMp3Flac } from '../scripts/cleanupMp3Flac';
import { getAudioDirectory } from '../utils/config';
import { log } from '../utils/logger';
import { Spinner } from '../utils/progress';

const program = new Command();

program
  .name('cleanup-mp3-flac')
  .description('Find and remove MP3 files that have FLAC counterparts')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  /**
   * Action handler for the cleanup-mp3-flac command.
   * Retrieves the audio directory and calls the cleanupMp3Flac script.
   *
   * @param directory - Optional directory path from the command line.
   * @param options - Command line options, including dryRun.
   */
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);
    log.info(`Using directory: ${audioDir}`);

    const spinner = new Spinner('Processing');
    await cleanupMp3Flac(audioDir, options.dryRun, { spinner });
  });

export default program; 