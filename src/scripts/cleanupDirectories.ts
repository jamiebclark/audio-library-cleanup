import * as fs from 'fs';
import * as path from 'path';
import {
  DirectoryInfo,
  ProgressTracker,
  countItems,
  generateProgressTracker,
  getDirectoryLastModified,
  getSubfolderCount,
  hasAccents,
  normalizeForFuzzyMatching,
  traverseDirectory,
  writeScriptResults
} from '../utils/fileUtils';
import { log } from '../utils/logger';
import { Spinner, generateSpinner } from '../utils/progress';

/**
 * Get the containing album directory for a path (typically 2 levels up from leaf directories)
 * 
 * For example:
 * M:/Music/Library/Artist/Album/Artwork -> M:/Music/Library/Artist/Album
 * M:/Music/Library/Artist/Album -> M:/Music/Library/Artist
 */
function getAlbumContext(filePath: string, baseDir: string): string {
  // Get path relative to the base directory
  const relativePath = path.relative(baseDir, filePath);
  // Split into components
  const parts = relativePath.split(path.sep);

  // If we're at least 2 levels deep, use parent directory as context
  if (parts.length >= 2) {
    // Return the parent path (e.g., "Artist/Album" for "Artist/Album/Artwork")
    return parts.slice(0, -1).join(path.sep);
  }

  // If we're just 1 level deep, use that as context
  return parts.length === 1 ? parts[0] : '';
}

interface CleanupOptions {
  force?: boolean;
  spinner?: Spinner;
  progressTracker?: ProgressTracker;
}

export async function cleanupDirectories(
  directory: string,
  dryRun: boolean,
  options: CleanupOptions = {}
) {
  log.info('Looking for similar directory names...');

  // Get all directories
  const directories: DirectoryInfo[] = [];

  // Add spinner for counting items
  const spinner = generateSpinner('Cleanup directories: Counting items to process', options?.spinner);

  const totalItems = countItems(directory, true);

  // Update spinner with count result
  spinner.succeed(`Cleanup directories: Found ${totalItems} directories to cleanup`);

  // Use provided progress tracker or create a new one
  const progressTracker = generateProgressTracker(totalItems, directory, options?.progressTracker);

  try {
    traverseDirectory(
      directory,
      (itemPath, isDirectory) => {
        if (isDirectory) {
          directories.push({
            path: itemPath,
            name: path.basename(itemPath),
            subfolderCount: getSubfolderCount(itemPath),
            lastModified: getDirectoryLastModified(itemPath),
            hasAccents: hasAccents(path.basename(itemPath))
          });
        }
      },
      { progressTracker, countDirectories: true }
    );
  } catch (error) {
    log.error('Error scanning directories:', error);
    process.exit(1);
  }

  progressTracker.clear();
  log.success('Scanning complete!');

  // Group directories by context (album folder) and then by normalized name
  const contextGroups = new Map<string, Map<string, DirectoryInfo[]>>();

  directories.forEach(dir => {
    // Get the directory's context (album directory)
    const context = getAlbumContext(dir.path, directory);

    // Skip the root level directories
    if (!context) return;

    // Create map for this context if it doesn't exist
    if (!contextGroups.has(context)) {
      contextGroups.set(context, new Map<string, DirectoryInfo[]>());
    }

    const dirMap = contextGroups.get(context)!;
    const normalizedName = normalizeForFuzzyMatching(dir.name);

    // Create array for this normalized name if it doesn't exist
    if (!dirMap.has(normalizedName)) {
      dirMap.set(normalizedName, []);
    }

    // Add this directory to the array for its context and normalized name
    dirMap.get(normalizedName)!.push(dir);
  });

  // Process fuzzy duplicate groups by context
  let directoriesProcessed = 0;
  let changesCount = 0; // Counter for actual or potential changes

  for (const [context, dirMap] of contextGroups) {
    // Check if any group in this context has duplicates
    let hasMatchesInContext = false;

    for (const [normalizedName, dirGroup] of dirMap) {
      if (dirGroup.length > 1) {
        if (!hasMatchesInContext) {
          log.subHeader(`Checking context: ${context}`);
          hasMatchesInContext = true;
        }

        log.info(`Found fuzzy matches for: ${normalizedName}`);

        dirGroup.forEach(dir => {
          log.info(`- ${dir.name} (${dir.path})`);
          log.info(`  Subfolders: ${dir.subfolderCount}, Modified: ${dir.lastModified.toISOString()}, Has accents: ${dir.hasAccents}`);
        });

        // Apply priority rules to select which directory to keep
        const dirToKeep = selectDirectoryToKeep(dirGroup);
        log.success(`Keeping: ${dirToKeep.name} (${dirToKeep.path})`);

        // Move content from other dirs to the kept dir and delete them
        for (const dir of dirGroup) {
          if (dir.path !== dirToKeep.path) {
            if (dryRun) {
              log.dryRun(`Would merge and delete: ${dir.name} (${dir.path})`);
              changesCount++; // Increment for potential change
            } else {
              const mergeSpinner = new Spinner(`Merging: ${dir.name} (${dir.path})`);
              mergeSpinner.start();
              mergeDirectories(dir.path, dirToKeep.path);
              mergeSpinner.succeed('Merged and deleted');
              directoriesProcessed++;
              changesCount++; // Increment for actual change
            }
          }
        }
      }
    }
  }

  if (directoriesProcessed > 0) {
    log.result(`Merged ${directoriesProcessed} directories.`);
  } else {
    log.info('No similar directories found that needed to be merged.');
  }

  // Write results to JSON file using the utility function
  writeScriptResults('cleanupDirectories.ts', { directoriesMergedOrProcessed: changesCount });
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