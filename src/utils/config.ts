export function getAudioDirectory(specifiedDir?: string): string {
  if (specifiedDir) {
    return specifiedDir;
  }

  const envDir = process.env.AUDIO_LIBRARY_PATH;
  if (!envDir) {
    throw new Error(
      'No audio directory specified. Either provide a directory path or set the AUDIO_LIBRARY_PATH environment variable.'
    );
  }

  return envDir;
} 