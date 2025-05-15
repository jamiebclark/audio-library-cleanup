import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';

export function writeScriptResults(scriptName: string, resultsData: Record<string, number>): void {
  const outputDir = path.join('output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get the filename from the scriptName (e.g. cleanupDirectories.ts -> cleanupDirectories)
  const baseName = path.basename(scriptName, '.ts');
  const outputFileName = `${baseName}.json`;
  const outputFilePath = path.join(outputDir, outputFileName);
  fs.writeFileSync(outputFilePath, JSON.stringify(resultsData, null, 2));
  log.info(`Results saved to ${outputFilePath}`);
} 