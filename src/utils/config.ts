import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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
 * Get configuration from environment variables
 */
export function getConfig() {
  return {
    audioLibraryPath: process.env.AUDIO_LIBRARY_PATH,
    dryRun: process.env.DRY_RUN === 'true',
  };
} 