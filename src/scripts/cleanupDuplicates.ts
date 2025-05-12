import { Command } from 'commander';
import { getAudioDirectory } from '../utils/config';
import {
  AudioFile,
  deleteFile,
  getAudioFilesInDirectory
} from '../utils/fileUtils';
import { getFileName, readableFileSize } from '../utils/formatUtils';

export async function cleanupDuplicates(directory: string, dryRun: boolean) {
  const files = getAudioFilesInDirectory(directory);
  const exactDuplicates = new Map<string, AudioFile[]>();

  // Group files by their base name (without extension)
  files.forEach(file => {
    const baseName = file.name.replace(/\(\d+\)$/, '').trim();
    if (!exactDuplicates.has(baseName)) {
      exactDuplicates.set(baseName, []);
    }
    exactDuplicates.get(baseName)!.push(file);
  });

  // Process exact duplicates
  for (const [baseName, fileGroup] of exactDuplicates) {
    if (fileGroup.length > 1) {
      console.log(`\nFound duplicates for: ${baseName}`);

      // Sort by size (largest first)
      fileGroup.sort((a, b) => b.size - a.size);

      // Keep the largest file, delete others
      const [keepFile, ...deleteFiles] = fileGroup;

      console.log(`Keeping: ${getFileName(keepFile.path)} (${readableFileSize(keepFile.size)})`);

      for (const file of deleteFiles) {
        console.log(`Would delete: ${getFileName(file.path)} (${readableFileSize(file.size)})`);
        if (!dryRun) {
          deleteFile(file.path);
          console.log('Deleted.');
        }
      }
    }
  }
}

const program = new Command();

program
  .name('cleanup-duplicates')
  .description('Clean up duplicate audio files in a directory')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);
    console.log(`Using directory: ${audioDir}\n`);
    await cleanupDuplicates(audioDir, options.dryRun);
  });

program.parse(); 