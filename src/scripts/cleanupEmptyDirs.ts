import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { getPathsToSkip } from '../utils/config';
import {
  AUDIO_EXTENSIONS,
  countItems,
  deleteDirectory,
  generateProgressTracker,
  getCorrectCasePath,
  isAudioFile,
  isDirectoryEmpty,
  ProgressTracker,
  traverseDirectory
} from '../utils/fileUtils';
import { getFileName } from '../utils/formatUtils';
import { log } from '../utils/logger';
import { generateSpinner, Spinner } from '../utils/progress';

const execPromise = promisify(exec);

// Use Windows native command to check for audio files in a directory
// This bypasses Node.js filesystem which can have issues with case sensitivity on Windows
async function checkDirectoryWithNativeCommand(dirPath: string): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false; // Only use this on Windows
  }

  try {
    log.info(`CHECKING WITH NATIVE WINDOWS COMMAND: ${dirPath}`);

    // Use PowerShell instead of cmd - it handles paths with special characters better
    try {
      // For PowerShell, we need to handle both:
      // 1. Command string parsing (how PowerShell interprets the command string)
      // 2. Path literal handling (how PowerShell finds the actual file)

      // Base64 encode the path to completely avoid special character issues in the command
      const encodedPath = Buffer.from(dirPath).toString('base64');

      // Use PowerShell's built-in base64 decoding to recover the exact path
      // This bypasses all issues with special characters in the command string
      const extensions = AUDIO_EXTENSIONS.map(ext => `'*${ext}'`).join(',');
      const psCommand = `powershell -NoProfile -Command "$path = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}')); Get-ChildItem -LiteralPath $path -Recurse -File -Include ${extensions} | Select-Object -First 1 -ExpandProperty FullName"`;

      // Set a timeout to prevent hanging
      const { stdout, stderr } = await execPromise(psCommand, { timeout: 10000 });

      if (stderr) {
        log.warning(`PowerShell command warning: ${stderr}`);
      }

      const hasAudioFiles = stdout.trim().length > 0;

      if (hasAudioFiles) {
        log.info(`Found audio files with PowerShell command`);
        log.info(`  First file: ${stdout.trim()}`);
      } else {
        log.info(`No audio files found with PowerShell command`);
      }

      return hasAudioFiles;
    } catch (psErr) {
      log.error(`PowerShell command failed: ${psErr}`);

      // Fallback: try a basic dir command without pipes or complex filters
      try {
        // Simple check for any files in directory
        const command = `dir "${dirPath}" /b`;
        const { stdout } = await execPromise(command, { timeout: 5000 });

        if (stdout.trim().length === 0) {
          log.info(`Directory appears empty according to basic dir command`);
          return false; // Directory is empty, no need to check further
        }

        // Simple fallback: check if any audio extension names appear in the output
        // This is not perfect but provides a fallback check
        const dirOutput = stdout.toLowerCase();
        const hasAudio = AUDIO_EXTENSIONS.some(ext => dirOutput.includes(ext));

        log.info(`Basic dir command ${hasAudio ? 'found' : 'did not find'} audio file extensions`);

        return hasAudio;
      } catch (dirErr) {
        log.error(`Basic dir command also failed: ${dirErr}`);
        return false;
      }
    }
  } catch (err) {
    log.error(`Error in native command checking: ${err}`);
    return false;
  }
}

// Enhanced function to thoroughly check a directory for audio files
// This version makes extra efforts to handle Windows case-insensitivity issues
async function thoroughCheckDirectoryForAudio(dirPath: string): Promise<boolean> {
  // Get exact case path for more reliable directory reading
  const correctedPath = getCorrectCasePath(dirPath);

  log.debug(`Checking directory for audio: ${dirPath}`);
  if (correctedPath !== dirPath) {
    log.debug(`Corrected path: ${correctedPath}`);
  }

  // Make sure we can access the directory
  if (!fs.existsSync(correctedPath)) {
    log.debug(`Directory does not exist: ${correctedPath}`);
    return false;
  }

  // Check if this directory has case sensitivity issues by comparing parent directory entries
  const dirName = path.basename(dirPath);
  const parentDir = path.dirname(dirPath);
  let hasCaseSensitivityIssue = false;

  try {
    // Use withFileTypes to preserve original case
    const siblingEntries = fs.readdirSync(parentDir, { withFileTypes: true });

    // Find directories that have the same name when case is ignored
    const similarNames = siblingEntries
      .filter(entry => entry.name.toLowerCase() === dirName.toLowerCase() && entry.name !== dirName)
      .map(entry => entry.name);

    if (similarNames.length > 0) {
      hasCaseSensitivityIssue = true;
      log.debug(`Case sensitivity issue detected:`);
      log.info(`  Requested: ${dirName}`);
      log.info(`  Similar entries found: ${similarNames.join(', ')}`);
    }
  } catch (err) {
    // Continue even if we can't check for case sensitivity issues
  }

  try {
    // Read directory with error catching
    let entries: fs.Dirent[] = [];
    try {
      // Use withFileTypes to preserve original case
      entries = fs.readdirSync(correctedPath, { withFileTypes: true });
    } catch (err) {
      log.error(`THOROUGH DEBUG: Error reading directory: ${correctedPath}`, err);

      // If Node.js can't read the directory, try native Windows command
      if (process.platform === 'win32') {
        const hasAudioNative = await checkDirectoryWithNativeCommand(dirPath);
        if (hasAudioNative) {
          return true;
        }
      }

      return false;
    }

    log.debug(`Directory contains ${entries.length} items:`);
    if (entries.length === 0) {
      // For empty directories, try to list parent directory to diagnose issues
      try {
        const parentDir = path.dirname(correctedPath);
        const parentEntries = fs.readdirSync(parentDir, { withFileTypes: true });
        log.debug(`Parent directory contains ${parentEntries.length} items:`);
        parentEntries.forEach(entry => {
          log.info(`  - ${entry.name} (${entry.isDirectory() ? 'directory' : 'file'})`);
        });

        // If this appears to be a case-sensitivity issue (directory exists but shows empty)
        // Try using native Windows command
        if (parentEntries.some(entry => entry.name.toLowerCase() === path.basename(dirPath).toLowerCase())) {
          log.debug(`This appears to be a case sensitivity issue. Trying Windows command...`);
          const hasAudioNative = await checkDirectoryWithNativeCommand(dirPath);
          if (hasAudioNative) {
            return true;
          }
        }

      } catch (err) {
        log.error(`THOROUGH DEBUG: Cannot read parent directory`);
      }
    }

    // First try to find audio files in the current directory using both methods
    // Method 1: Filter by extension
    const audioFiles = entries.filter(entry => {
      try {
        return !entry.isDirectory() && isAudioFile(entry.name);
      } catch (err) {
        return false;
      }
    });

    if (audioFiles.length > 0) {
      log.debug(`Found ${audioFiles.length} audio files in this directory`);
      return true;
    }

    // Method 2: Read the directory using Windows-native path methods 
    // This can help with case-sensitivity issues on Windows
    try {
      const winPath = dirPath.replace(/\//g, '\\');
      const winEntries = fs.readdirSync(winPath, { withFileTypes: true });

      if (winEntries.length !== entries.length) {
        log.debug(`Windows path found ${winEntries.length} items (different from normal path)`);
        winEntries.forEach(entry => log.info(`  - ${entry.name}`));
      }

      const winAudioFiles = winEntries.filter(entry => {
        try {
          return !entry.isDirectory() && isAudioFile(entry.name);
        } catch (err) {
          return false;
        }
      });

      if (winAudioFiles.length > 0) {
        log.debug(`Windows path found ${winAudioFiles.length} audio files`);
        winAudioFiles.forEach(entry => log.info(`  - ${entry.name}`));
        return true;
      }
    } catch (err) {
      // Ignore errors with Windows path method
    }

    // If directory appears empty but might have case issues, try Windows command
    if (entries.length === 0 && process.platform === 'win32') {
      const hasAudioNative = await checkDirectoryWithNativeCommand(dirPath);
      if (hasAudioNative) {
        return true;
      }
    }

    // Now check subdirectories recursively
    const subdirs = entries.filter(entry => {
      try {
        return entry.isDirectory();
      } catch (err) {
        return false;
      }
    });

    if (subdirs.length > 0) {
      log.debug(`Found ${subdirs.length} subdirectories to check`);
    }

    for (const subdir of subdirs) {
      const subdirPath = path.join(correctedPath, subdir.name);
      const hasAudio = await thoroughCheckDirectoryForAudio(subdirPath);

      if (hasAudio) {
        log.debug(`Subdirectory ${subdir.name} contains audio files`);
        return true;
      } else {
        log.debug(`Subdirectory ${subdir.name} does NOT contain audio files`);
      }
    }

    // If we suspect a case sensitivity issue and we're on Windows,
    // always perform the native command check for better reliability
    if (hasCaseSensitivityIssue && process.platform === 'win32') {
      log.debug(`Performing native command check due to case sensitivity issue`);
      const hasAudioNative = await checkDirectoryWithNativeCommand(dirPath);
      if (hasAudioNative) {
        log.debug(`Native command found audio files!`);
        return true;
      }
    }

    log.debug(`No audio files found in ${correctedPath} or its subdirectories`);
    return false;

  } catch (err) {
    log.error(`THOROUGH DEBUG: Error checking directory ${correctedPath}:`, err);

    // Try Windows command as last resort
    if (process.platform === 'win32') {
      const hasAudioNative = await checkDirectoryWithNativeCommand(dirPath);
      return hasAudioNative;
    }

    return false;
  }
}

interface CleanupOptions {
  force?: boolean;
  spinner?: Spinner;
  progressTracker?: ProgressTracker;
}

export async function cleanupEmptyDirs(
  directory: string,
  dryRun: boolean,
  options: CleanupOptions = {}
) {
  const emptyDirs: string[] = [];
  const noAudioDirs: string[] = [];
  const potentialCaseIssues: string[] = [];
  const errorDirs: string[] = [];
  const skippedDirs: Set<string> = new Set(); // Track directories to skip

  // Use provided spinner or create a new one
  const countingSpinner = generateSpinner('Counting items to process', options?.spinner);

  const totalItems = countItems(directory, true);

  // Update spinner with count result
  countingSpinner.succeed(`Found ${totalItems} directories to search for empty directories`);


  // Use provided progress tracker or create a new one
  const progressTracker = generateProgressTracker(totalItems, directory, options?.progressTracker);


  // Get user-configured paths to skip from config
  const configuredSkipPaths = getPathsToSkip(directory);
  if (configuredSkipPaths.length > 0) {
    log.info(`Loaded ${configuredSkipPaths.length} paths to skip from configuration`);
  }

  // First pass: collect directory paths to check later
  // We need to check directories bottom-up after we've seen all subdirectories
  const dirsToCheck: string[] = [];

  // Map to track directories with potential case sensitivity issues
  // Key: lowercase path, Value: count of directories with this lowercase path
  const caseSensitivityMap: Map<string, number> = new Map();

  traverseDirectory(
    directory,
    (itemPath, isDirectory) => {
      if (isDirectory) {
        dirsToCheck.push(itemPath);

        // Track potential case sensitivity issues
        const lowerPath = itemPath.toLowerCase();
        caseSensitivityMap.set(lowerPath, (caseSensitivityMap.get(lowerPath) || 0) + 1);
      }
    },
    { progressTracker }
  );

  progressTracker.clear();
  log.success('Scanning complete!');

  // Identify directories with potential case sensitivity issues
  // (multiple directories with the same case-insensitive path)
  const potentialProblemPaths: Set<string> = new Set();
  for (const [lowerPath, count] of caseSensitivityMap.entries()) {
    if (count > 1) {
      potentialProblemPaths.add(lowerPath);
    }
  }

  // Second pass: check each directory (from deepest to shallowest)
  // Sort by path length in descending order to check deepest directories first
  dirsToCheck.sort((a, b) => b.length - a.length);

  log.info(`Checking ${dirsToCheck.length} directories for audio content...`);
  let dirCheckedCount = 0;
  let verboseLogging = dryRun;

  // Create a set to track directories we've already processed
  // This helps prevent duplicate processing when case sensitivity issues exist
  const processedDirLowerCase = new Set<string>();

  progressTracker.setTotalItems(dirsToCheck.length);

  for (const dirPath of dirsToCheck) {
    try {
      progressTracker.update(dirPath);

      // Log progress every 100 directories
      dirCheckedCount++;
      if (dirCheckedCount % 100 === 0) {
        log.info(`Checked ${dirCheckedCount}/${dirsToCheck.length} directories...`);
      }

      const lowerPath = dirPath.toLowerCase();
      let shouldSkip = false;

      // Skip if we've already processed this directory (case-insensitive check)
      if (processedDirLowerCase.has(lowerPath)) {
        if (verboseLogging) {
          log.info(`Skipping already processed directory (case variation): ${dirPath}`);
        }
        continue;
      }

      // Check if this path has case sensitivity conflicts
      if (potentialProblemPaths.has(lowerPath)) {
        if (verboseLogging) {
          log.info(`Skipping directory with potential case sensitivity conflicts: ${dirPath}`);
          log.info(`This path has multiple case variations which could cause issues.`);
        }
        skippedDirs.add(dirPath);
        continue;
      }

      // Check if this path or any parent is in the user-configured skip list
      if (configuredSkipPaths.length > 0) {
        const shouldSkipFromConfig = configuredSkipPaths.some(skipPath =>
          lowerPath === skipPath || lowerPath.startsWith(skipPath + path.sep)
        );

        if (shouldSkipFromConfig) {
          if (verboseLogging) {
            log.info(`Skipping user-configured path: ${dirPath}`);
          }
          skippedDirs.add(dirPath);
          continue;
        }
      }

      // Mark as processed
      processedDirLowerCase.add(lowerPath);

      const isEmpty = isDirectoryEmpty(dirPath);
      if (isEmpty) {
        emptyDirs.push(dirPath);
      } else {
        // Check if the directory might have case-sensitivity issues
        let hasCaseIssues = false;
        try {
          const items = fs.readdirSync(dirPath);
          const dirs = items.filter(item => {
            try {
              return fs.statSync(path.join(dirPath, item)).isDirectory();
            } catch (e) {
              return false;
            }
          });

          // Check for case-insensitive duplicates
          const lowerCaseDirs = dirs.map(d => d.toLowerCase());
          hasCaseIssues = lowerCaseDirs.length !== new Set(lowerCaseDirs).size;

          // Also check if the directory name itself might be a case variant
          const dirName = path.basename(dirPath);
          const parentDir = path.dirname(dirPath);

          try {
            const siblings = fs.readdirSync(parentDir);
            const similarSiblings = siblings.filter(s =>
              s.toLowerCase() === dirName.toLowerCase() && s !== dirName
            );

            if (similarSiblings.length > 0) {
              hasCaseIssues = true;
              if (verboseLogging) {
                log.info(`Directory has case-sensitive siblings: ${dirPath}`);
                similarSiblings.forEach(s => log.info(`  - ${s}`));
              }
            }
          } catch (err) {
            // Ignore errors when checking siblings
          }

        } catch (err) {
          // Capture directories we can't read
          errorDirs.push(dirPath);
          if (verboseLogging) {
            log.error(`Error reading directory: ${dirPath}`, err);
          }
          continue;
        }

        // If we suspect case issues or we're in verbose mode, use the more thorough checker
        const hasAudio = await thoroughCheckDirectoryForAudio(dirPath);

        if (!hasAudio) {
          // For directories with no audio, check for case sensitivity issues
          if (hasCaseIssues) {
            potentialCaseIssues.push(dirPath);

            if (verboseLogging) {
              log.warn(`WARNING: Directory has case-sensitivity issues but no audio: ${dirPath}`);
              try {
                const items = fs.readdirSync(dirPath);
                const subdirs = items.filter(item => {
                  try {
                    return fs.statSync(path.join(dirPath, item)).isDirectory();
                  } catch (e) {
                    return false;
                  }
                });

                if (subdirs.length > 0) {
                  log.info(`  Subdirectories (${subdirs.length}):`);
                  subdirs.forEach(subdir => log.info(`    - ${subdir}`));

                  // Group case-insensitive duplicates
                  const dupeGroups: Record<string, string[]> = {};

                  for (const s of subdirs) {
                    const lower = s.toLowerCase();
                    if (!dupeGroups[lower]) {
                      dupeGroups[lower] = [s];
                    } else {
                      dupeGroups[lower].push(s);
                    }
                  }

                  // Check each subdirectory with Windows commands
                  if (process.platform === 'win32') {
                    log.info(`  Checking directories with native Windows commands:`);
                    for (const subdir of subdirs) {
                      const subdirPath = path.join(dirPath, subdir);
                      const hasAudioNative = await checkDirectoryWithNativeCommand(subdirPath);
                      log.info(`    - ${subdir} (has audio with Windows command: ${hasAudioNative})`);

                      // If we found audio, update the result
                      if (hasAudioNative) {
                        log.warn(`  WARNING: Found audio files using Windows command that were missed by Node.js!`);
                        return; // Skip this directory since it actually has audio
                      }
                    }
                  }

                  // Log duplicate groups and check each one thoroughly
                  for (const [lower, dupes] of Object.entries(dupeGroups)) {
                    if (dupes.length > 1) {
                      log.info(`  Case-insensitive duplicates for "${lower}":`);
                      for (const dupe of dupes) {
                        const dupePath = path.join(dirPath, dupe);
                        const hasAudioInDupe = await thoroughCheckDirectoryForAudio(dupePath);
                        const hasAudioNative = process.platform === 'win32' ?
                          await checkDirectoryWithNativeCommand(dupePath) : false;

                        log.info(`    - ${dupe} (has audio: ${hasAudioInDupe || hasAudioNative})`);

                        // If we found audio, update the result
                        if (hasAudioInDupe || hasAudioNative) {
                          log.warn(`  WARNING: Found audio files in subdirectory that were missed by initial scan!`);
                          return; // Skip this directory since it actually has audio
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                log.error(`Error analyzing subdirectories: ${dirPath}`, err);
              }
            }
          }

          // Double-check with Windows command for problematic directories
          if (process.platform === 'win32' && (hasCaseIssues || verboseLogging)) {
            const hasAudioNative = await checkDirectoryWithNativeCommand(dirPath);
            if (hasAudioNative) {
              if (verboseLogging) {
                log.info(`Found audio files using Windows command that were missed by Node.js!`);
              }
              continue; // Skip this directory since it actually has audio
            }
          }

          noAudioDirs.push(dirPath);
        }
      }
    } catch (error) {
      log.error(`Error checking directory: ${dirPath}`, error);
      errorDirs.push(dirPath);
    }
  }

  // Process empty directories
  if (emptyDirs.length > 0) {
    log.info('Empty directories found:');
    for (const dir of emptyDirs) {
      log.info(`Would delete empty directory: ${getFileName(dir)}`);
      if (!dryRun) {
        deleteDirectory(dir);
        log.info('Deleted.');
      }
    }
  }

  // Process directories without audio files
  if (noAudioDirs.length > 0) {
    log.info('Directories without audio files found:');

    // Warn about potential case-sensitivity issues
    if (potentialCaseIssues.length > 0) {
      log.warn('WARNING: Some directories have potential case-sensitivity issues:');
      for (const dir of potentialCaseIssues) {
        log.info(`  - ${getFileName(dir)}`);
      }
      log.info('Consider running with --dry-run for detailed diagnostics.');
    }

    // Warn about directories with read errors
    if (errorDirs.length > 0) {
      log.warn('WARNING: Some directories had read errors:');
      for (const dir of errorDirs) {
        log.info(`  - ${getFileName(dir)}`);
      }
      log.info('These directories will not be processed for safety.');
    }

    // Report on skipped directories
    if (skippedDirs.size > 0) {
      log.info('Skipped directories with known issues:');
      for (const dir of skippedDirs) {
        log.info(`  - ${getFileName(dir)}`);
      }
      log.info('These directories should be checked manually.');
    }

    for (const dir of noAudioDirs) {
      const hasCaseIssue = potentialCaseIssues.includes(dir);
      const hasError = errorDirs.includes(dir);

      if (hasCaseIssue || hasError) {
        log.warn(`WARNING - Directory with ${hasCaseIssue ? 'potential case issues' : 'read errors'}: ${getFileName(dir)}`);
        log.info(`  Full path: ${dir}`);

        if (dryRun) {
          log.info(`  Would delete directory without audio (check manually first)`);
        } else {
          log.info(`  Skipping deletion due to potential issues (use --dry-run to debug)`);
        }
      } else {
        log.info(`Would delete directory without audio: ${getFileName(dir)}`);
        if (!dryRun && !potentialCaseIssues.includes(dir) && !errorDirs.includes(dir)) {
          deleteDirectory(dir);
          log.info('Deleted.');
        }
      }
    }
  }

  if (emptyDirs.length === 0 && noAudioDirs.length === 0) {
    log.info('No empty directories or directories without audio files found.');
  }

  // Clear progress at the end
  progressTracker.clear();
} 