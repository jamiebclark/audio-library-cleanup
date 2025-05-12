import * as fs from 'fs';
import * as path from 'path';

export interface AudioFile {
  path: string;
  name: string;
  size: number;
  extension: string;
}

export interface DirectoryInfo {
  path: string;
  name: string;
  subfolderCount: number;
  lastModified: Date;
  hasAccents: boolean;
}

export const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav'];

export function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

export function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

export function getAudioFilesInDirectory(dirPath: string): AudioFile[] {
  const files: AudioFile[] = [];

  function traverse(currentPath: string) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (isAudioFile(item)) {
        files.push({
          path: fullPath,
          name: path.parse(item).name,
          size: stat.size,
          extension: path.extname(item).toLowerCase()
        });
      }
    }
  }

  traverse(dirPath);
  return files;
}

export function isDirectoryEmpty(dirPath: string): boolean {
  const items = fs.readdirSync(dirPath);
  return items.length === 0;
}

export function hasAudioFiles(dirPath: string): boolean {
  const items = fs.readdirSync(dirPath);
  return items.some(item => isAudioFile(item));
}

export function deleteFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

export function deleteDirectory(dirPath: string): void {
  fs.rmdirSync(dirPath, { recursive: true });
}

export function normalizeForFuzzyMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasAccents(text: string): boolean {
  return /[\u0300-\u036f]/.test(text) ||
    text.normalize('NFD').length !== text.normalize('NFC').length;
}

export function getSubfolderCount(dirPath: string): number {
  try {
    return fs.readdirSync(dirPath)
      .filter(item => fs.statSync(path.join(dirPath, item)).isDirectory())
      .length;
  } catch (error) {
    return 0;
  }
}

export function getDirectoryLastModified(dirPath: string): Date {
  try {
    return fs.statSync(dirPath).mtime;
  } catch (error) {
    return new Date(0);
  }
} 