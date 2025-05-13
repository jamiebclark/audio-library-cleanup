import { Command } from 'commander';
import {
  cleanupAllCommand,
  cleanupDirectoriesCommand,
  cleanupDuplicatesCommand,
  cleanupEmptyDirsCommand,
  cleanupMp3FlacCommand
} from './commands';

const program = new Command();

// Add all subcommands
program.addCommand(cleanupAllCommand);
program.addCommand(cleanupDirectoriesCommand);
program.addCommand(cleanupDuplicatesCommand);
program.addCommand(cleanupEmptyDirsCommand);
program.addCommand(cleanupMp3FlacCommand);

// Parse command line arguments
program.parse(); 