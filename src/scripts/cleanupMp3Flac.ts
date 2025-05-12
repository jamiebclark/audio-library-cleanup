import { Command } from 'commander';
import { getAudioDirectory } from '../utils/config';
import { AudioFile, deleteFile, getAudioFilesInDirectory } from '../utils/fileUtils';
import { getFileName, readableFileSize } from '../utils/formatUtils';

export async function cleanupMp3Flac(directory: string, dryRun: boolean) {
  const files = getAudioFilesInDirectory(directory);
  const fileGroups = new Map<string, AudioFile[]>();

  // Group files by their base name (without extension)
  files.forEach(file => {
    const baseName = file.name.replace(/\(\d+\)$/, '').trim();
    if (!fileGroups.has(baseName)) {
      fileGroups.set(baseName, []);
    }
    fileGroups.get(baseName)!.push(file);
  });

  // Process each group
  for (const [baseName, fileGroup] of fileGroups) {
    const hasFlac = fileGroup.some(file => file.extension === '.flac');
    const mp3Files = fileGroup.filter(file => file.extension === '.mp3');

    if (hasFlac && mp3Files.length > 0) {
      console.log(`\nFound FLAC and MP3 versions for: ${baseName}`);

      for (const mp3File of mp3Files) {
        console.log(`Would delete MP3: ${getFileName(mp3File.path)} (${readableFileSize(mp3File.size)})`);
        if (!dryRun) {
          deleteFile(mp3File.path);
          console.log('Deleted.');
        }
      }
    }
  }
}

const program = new Command();

program
  .name('cleanup-mp3-flac')
  .description('Remove MP3 files when FLAC versions exist')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be deleted without actually deleting')
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);
    console.log(`Using directory: ${audioDir}\n`);
    await cleanupMp3Flac(audioDir, options.dryRun);
  });

program.parse(); 