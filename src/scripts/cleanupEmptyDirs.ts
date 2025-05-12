import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getAudioDirectory } from '../utils/config';
import { deleteDirectory, hasAudioFiles, isDirectoryEmpty } from '../utils/fileUtils';
import { getFileName } from '../utils/formatUtils';

export async function cleanupEmptyDirs(directory: string, dryRun: boolean) {
  const emptyDirs: string[] = [];
  const noAudioDirs: string[] = [];

  function scanDirectory(dirPath: string) {
    const items = fs.readdirSync(dirPath);

    // First scan all subdirectories
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      if (fs.statSync(fullPath).isDirectory()) {
        scanDirectory(fullPath);
      }
    }

    // Then check this directory
    if (isDirectoryEmpty(dirPath)) {
      emptyDirs.push(dirPath);
    } else if (!hasAudioFiles(dirPath)) {
      noAudioDirs.push(dirPath);
    }
  }

  scanDirectory(directory);

  // Process empty directories
  if (emptyDirs.length > 0) {
    console.log('\nEmpty directories found:');
    for (const dir of emptyDirs) {
      console.log(`Would delete empty directory: ${getFileName(dir)}`);
      if (!dryRun) {
        deleteDirectory(dir);
        console.log('Deleted.');
      }
    }
  }

  // Process directories without audio files
  if (noAudioDirs.length > 0) {
    console.log('\nDirectories without audio files found:');
    for (const dir of noAudioDirs) {
      console.log(`Would delete directory without audio: ${getFileName(dir)}`);
      if (!dryRun) {
        deleteDirectory(dir);
        console.log('Deleted.');
      }
    }
  }

  if (emptyDirs.length === 0 && noAudioDirs.length === 0) {
    console.log('No empty directories or directories without audio files found.');
  }
}

const program = new Command();

program
  .name('cleanup-empty-dirs')
  .description('Remove empty directories and directories without audio files')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);
    console.log(`Using directory: ${audioDir}\n`);
    await cleanupEmptyDirs(audioDir, options.dryRun);
  });

program.parse(); 