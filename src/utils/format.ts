/**
 * Converts bytes to a human-readable file size string
 * @param bytes Number of bytes
 * @param decimals Number of decimal places to show (default: 2)
 * @returns Formatted string with appropriate unit (B, KB, MB, GB)
 */
export function readableFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Formats a file path to show only the filename
 * @param filePath Full path to the file
 * @returns Just the filename
 */
export function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
} 