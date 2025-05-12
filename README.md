# Audio Library Cleanup

A TypeScript library for managing and cleaning up audio file libraries. This tool helps you maintain a clean and organized audio library by:

- Removing duplicate audio files (keeping the larger version)
- Removing MP3 files when FLAC versions exist
- Cleaning up empty directories and directories without audio files
- Merging directories with similar names (fuzzy matching)

## Installation

```bash
yarn add audio-library-cleanup
```

## Configuration

You can set your audio library path as an environment variable to avoid specifying it in every command:

```bash
# Linux/macOS
export AUDIO_LIBRARY_PATH="/path/to/your/music"

# Windows (Command Prompt)
set AUDIO_LIBRARY_PATH=C:\path\to\your\music

# Windows (PowerShell)
$env:AUDIO_LIBRARY_PATH="C:\path\to\your\music"
```

## Usage

The library provides several command-line tools that can be run individually or together. If you've set the `AUDIO_LIBRARY_PATH` environment variable, you can omit the directory argument:

### Clean up all issues

```bash
# Using environment variable
yarn cleanup [options]

# Specifying directory
yarn cleanup <directory> [options]
```

Options:
- `-d, --dry-run`: Show what would be deleted without actually deleting
- `--skip-duplicates`: Skip duplicate file cleanup
- `--skip-mp3-flac`: Skip MP3/FLAC cleanup
- `--skip-empty-dirs`: Skip empty directory cleanup
- `--skip-directories`: Skip similar directory name cleanup

### Individual cleanup commands

1. Clean up duplicate files:
```bash
yarn cleanup:duplicates [directory] [-d]
```

2. Remove MP3 files when FLAC versions exist:
```bash
yarn cleanup:mp3-flac [directory] [-d]
```

3. Clean up empty directories:
```bash
yarn cleanup:empty-dirs [directory] [-d]
```

4. Merge directories with similar names:
```bash
yarn cleanup:directories [directory] [-d]
```

All commands support the `-d` or `--dry-run` option to preview changes without making them.

## Example

```bash
# Preview all cleanup operations using environment variable
yarn cleanup --dry-run

# Preview all cleanup operations with specific directory
yarn cleanup /path/to/music --dry-run

# Perform all cleanup operations
yarn cleanup

# Only clean up duplicates
yarn cleanup:duplicates

# Only merge similar directories
yarn cleanup:directories

# Clean up everything except similar directories
yarn cleanup --skip-directories
```

## Directory Fuzzy Matching

The directory fuzzy matching functionality helps you combine directories that represent the same content but have slightly different names, such as:

- Different spellings: "The Beatles" and "The Beetles"
- Different formats: "Pink Floyd" and "Pink_Floyd"
- Symbol variations: "AC/DC" and "AC-DC"
- Ampersand vs "and": "Hall & Oates" and "Hall and Oates"
- With or without accents: "Björk" and "Bjork"

When matching directories, the following priority is used to determine which version to keep:

1. Directories with accented characters are preferred over non-accented versions
2. Directories with more sub-folders are preferred
3. More recently modified directories are preferred
4. If all else is equal, the first directory is chosen

All content from merged directories is combined, with larger files being preserved when duplicates are found.

## Safety Features

- All commands support a dry-run mode to preview changes
- The tool keeps the larger version of duplicate files
- FLAC files are preserved over MP3 files
- Empty directories are only removed if they contain no files
- Directories without audio files are only removed if they contain no other files
- When merging similar directories, content is never deleted - only moved and consolidated

## License

ISC 