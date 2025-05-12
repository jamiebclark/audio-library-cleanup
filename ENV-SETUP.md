# Environment Variables Setup

To configure the audio-library-cleanup tool, you can use environment variables. 
The recommended way is to create a `.env` file in the root directory of the project with the following variables:

```
# Path to your audio library directory
AUDIO_LIBRARY_PATH=/path/to/your/audio/library

# Whether to run in dry-run mode by default (true/false)
DRY_RUN=false
```

## Usage

1. Create a file named `.env` in the root directory of this project
2. Copy the content above and modify the values as needed
3. The application will automatically load these values when it runs

## Alternative Methods

If you prefer not to use a `.env` file, you can also set environment variables:

### On Windows (Command Prompt)
```
set AUDIO_LIBRARY_PATH=C:\path\to\your\music
```

### On Windows (PowerShell)
```
$env:AUDIO_LIBRARY_PATH="C:\path\to\your\music"
```

### On Linux/macOS
```
export AUDIO_LIBRARY_PATH="/path/to/your/music"
```

## Command Line Priority

Command-line arguments will always take precedence over environment variables, allowing you to override your default settings for specific runs. 