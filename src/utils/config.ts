import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';

// Load environment variables from .env file
dotenv.config();

/**
 * Determines the audio directory to be used for cleanup operations.
 * It prioritizes the directory specified as an argument, then falls back to the
 * AUDIO_LIBRARY_PATH environment variable.
 * 
 * @param specifiedDir - An optional directory path provided directly.
 * @returns The resolved audio directory path.
 * @throws Error if no directory is specified and the environment variable is not set.
 */
export function getAudioDirectory(specifiedDir?: string): string {
  if (specifiedDir) {
    return specifiedDir;
  }

  const envDir = process.env.AUDIO_LIBRARY_PATH;
  if (!envDir) {
    throw new Error(
      'No audio directory specified. Either provide a directory path or set the AUDIO_LIBRARY_PATH environment variable in a .env file.'
    );
  }

  return envDir;
}

/**
 * Retrieves application configuration settings from environment variables.
 * 
 * @returns An object containing configuration properties:
 *  - `audioLibraryPath`: The path to the audio library (from `AUDIO_LIBRARY_PATH`).
 *  - `dryRun`: A boolean indicating if dry run mode is enabled (from `DRY_RUN`).
 */
export function getConfig() {
  return {
    audioLibraryPath: process.env.AUDIO_LIBRARY_PATH,
    dryRun: process.env.DRY_RUN === 'true',
  };
}

/**
 * Load the paths to skip from a config file if available
 * This allows users to specify problematic paths without code changes
 * 
 * The config file should be a JSON file with an array of paths to skip
 * Example: ["Artist/Album", "Another Artist/Problem Album"]
 * 
 * @param audioRootDir The root audio directory to resolve relative paths against
 * @returns Array of lowercase absolute paths to skip
 */
export function getPathsToSkip(audioRootDir: string): string[] {
  // Default file is in the same directory as the audio library
  const configPath = process.env.SKIP_PATHS_CONFIG || path.join(audioRootDir, '.audio-library-skip-paths.json');

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Handle both array format and object with paths property
      let pathsToSkip: string[] = [];

      if (Array.isArray(config)) {
        pathsToSkip = config;
      } else if (config && Array.isArray(config.paths)) {
        pathsToSkip = config.paths;
      }

      // Convert all paths to absolute and normalize case
      return pathsToSkip.map(p => {
        // If path is already absolute, use it directly
        if (path.isAbsolute(p)) {
          return p.toLowerCase();
        }
        // Otherwise, resolve it against the audio root directory
        return path.join(audioRootDir, p).toLowerCase();
      });
    }
  } catch (error) {
    log.error(`Error loading skip paths config: ${error}`);
  }

  // Return empty array if no config file or error
  return [];
} 