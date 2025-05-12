import { Command } from 'commander';
import { getAudioDirectory } from '../utils/config';
import { cleanupDirectories } from './cleanupDirectories';
import { cleanupDuplicates } from './cleanupDuplicates';
import { cleanupEmptyDirs } from './cleanupEmptyDirs';
import { cleanupMp3Flac } from './cleanupMp3Flac';

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
    console.log('Starting audio library cleanup...\n');
    console.log(`Using directory: ${audioDir}\n`);

    if (!options.skipDuplicates) {
      console.log('=== Checking for duplicate files ===');
      await cleanupDuplicates(audioDir, options.dryRun);
    }

    if (!options.skipMp3Flac) {
      console.log('\n=== Checking for MP3/FLAC duplicates ===');
      await cleanupMp3Flac(audioDir, options.dryRun);
    }

    if (!options.skipDirectories) {
      console.log('\n=== Checking for similar directory names ===');
      await cleanupDirectories(audioDir, options.dryRun);
    }

    if (!options.skipEmptyDirs) {
      console.log('\n=== Checking for empty directories ===');
      await cleanupEmptyDirs(audioDir, options.dryRun);
    }

    console.log('\nCleanup complete!');
  });

program.parse(); 