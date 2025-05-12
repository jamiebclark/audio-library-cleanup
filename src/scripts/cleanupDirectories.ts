import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getAudioDirectory } from '../utils/config';
import {
  DirectoryInfo,
  getDirectoryLastModified,
  getSubfolderCount,
  hasAccents,
  normalizeForFuzzyMatching
} from '../utils/fileUtils';

export async function cleanupDirectories(directory: string, dryRun: boolean) {
  console.log('Looking for similar directory names...');

  // Get all directories
  const directories: DirectoryInfo[] = [];

  function scanDirectories(dir: string) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        directories.push({
          path: fullPath,
          name: item,
          subfolderCount: getSubfolderCount(fullPath),
          lastModified: getDirectoryLastModified(fullPath),
          hasAccents: hasAccents(item)
        });

        scanDirectories(fullPath);
      }
    }
  }

  scanDirectories(directory);

  // Group directories by normalized name for fuzzy matching
  const fuzzyGroups = new Map<string, DirectoryInfo[]>();

  directories.forEach(dir => {
    const normalizedName = normalizeForFuzzyMatching(dir.name);
    if (!fuzzyGroups.has(normalizedName)) {
      fuzzyGroups.set(normalizedName, []);
    }
    fuzzyGroups.get(normalizedName)!.push(dir);
  });

  // Process fuzzy duplicate groups
  let directoriesProcessed = 0;

  for (const [normalizedName, dirGroup] of fuzzyGroups) {
    if (dirGroup.length > 1) {
      console.log(`\nFound fuzzy matches for: ${normalizedName}`);

      dirGroup.forEach(dir => {
        console.log(`- ${dir.name} (${dir.path})`);
        console.log(`  Subfolders: ${dir.subfolderCount}, Modified: ${dir.lastModified.toISOString()}, Has accents: ${dir.hasAccents}`);
      });

      // Apply priority rules to select which directory to keep
      const dirToKeep = selectDirectoryToKeep(dirGroup);
      console.log(`\nKeeping: ${dirToKeep.name} (${dirToKeep.path})`);

      // Move content from other dirs to the kept dir and delete them
      for (const dir of dirGroup) {
        if (dir.path !== dirToKeep.path) {
          console.log(`Would merge and delete: ${dir.name} (${dir.path})`);

          if (!dryRun) {
            mergeDirectories(dir.path, dirToKeep.path);
            console.log('Merged and deleted.');
            directoriesProcessed++;
          }
        }
      }
    }
  }

  if (directoriesProcessed > 0) {
    console.log(`\nMerged ${directoriesProcessed} directories.`);
  } else if (fuzzyGroups.size > 0) {
    console.log(`\nNo directories needed to be merged ${dryRun ? '(dry run)' : ''}.`);
  } else {
    console.log('\nNo similar directories found.');
  }
}

function selectDirectoryToKeep(dirs: DirectoryInfo[]): DirectoryInfo {
  // Priority 1: Always use the version with accents
  const withAccents = dirs.filter(dir => dir.hasAccents);
  if (withAccents.length > 0) {
    if (withAccents.length === 1) return withAccents[0];
    dirs = withAccents;
  }

  // Priority 2: Use folder with more sub-folders
  const maxSubfolders = Math.max(...dirs.map(dir => dir.subfolderCount));
  const withMaxSubfolders = dirs.filter(dir => dir.subfolderCount === maxSubfolders);
  if (withMaxSubfolders.length === 1) return withMaxSubfolders[0];
  dirs = withMaxSubfolders;

  // Priority 3: Pick the one that was more recently edited
  dirs.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  // Priority 4: Simply pick the first one (happens automatically by returning the first after sorting)
  return dirs[0];
}

function mergeDirectories(sourcePath: string, targetPath: string): void {
  // Make sure target directory exists
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  // Read all items in the source directory
  const items = fs.readdirSync(sourcePath);

  for (const item of items) {
    const sourceItemPath = path.join(sourcePath, item);
    const targetItemPath = path.join(targetPath, item);
    const stat = fs.statSync(sourceItemPath);

    if (stat.isDirectory()) {
      // For directories, recursively merge
      mergeDirectories(sourceItemPath, targetItemPath);
    } else {
      // For files, check if target already exists
      if (fs.existsSync(targetItemPath)) {
        const sourceSize = fs.statSync(sourceItemPath).size;
        const targetSize = fs.statSync(targetItemPath).size;

        // If target file is smaller, replace it with the source file
        if (sourceSize > targetSize) {
          fs.unlinkSync(targetItemPath);
          fs.copyFileSync(sourceItemPath, targetItemPath);
        }
        // Otherwise keep the target (larger) file
      } else {
        // If file doesn't exist in target, copy it
        fs.copyFileSync(sourceItemPath, targetItemPath);
      }
    }
  }

  // Delete the source directory after merging
  fs.rmdirSync(sourcePath, { recursive: true });
}

const program = new Command();

program
  .name('cleanup-directories')
  .description('Clean up directories with similar names using fuzzy matching')
  .argument('[directory]', 'directory to scan (defaults to AUDIO_LIBRARY_PATH environment variable)')
  .option('-d, --dry-run', 'show what would be merged without actually merging')
  .action(async (directory: string | undefined, options: { dryRun: boolean }) => {
    const audioDir = getAudioDirectory(directory);
    console.log(`Using directory: ${audioDir}\n`);
    await cleanupDirectories(audioDir, options.dryRun);
  });

program.parse(); 