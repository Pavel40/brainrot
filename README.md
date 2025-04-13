# BrainRot Video Generator

This Node.js script generates a “brainrot” video by combining AI-generated voice-over, subtitles (transcribed and corrected via AI), and a background video. It also supports optional background audio, multiple languages (Czech, English, German), and various customizable options via CLI.

## Features

- **AI Voice-over Text Generation:**  
  Generates a script from study material using ChatGPT (or uses a custom text passed via CLI).

- **Text-to-Speech (TTS):**  
  Uses the OpenAI API (GPT-4o Mini TTS) to generate voice-over audio in the chosen language.

- **Subtitles Generation:**  
  Uses Whisper for transcription and ChatGPT for correction to generate SRT subtitles from the TTS audio.

- **Video Background & Audio Mixing:**  
  Selects a background video (or a custom one via CLI) and loops it if shorter than the audio. Optionally, mixes in background audio at a lower volume.

- **Multi-Language Support:**  
  Supports Czech (default), English, and German. The language setting affects the prompts for text generation, TTS instructions, and subtitle editing.

- **CLI Options:**  
  Customize video background, voice-over text, background audio, and language via command-line options.

## Dependencies

- **Node.js** (v14 or later recommended)
- **ffmpeg** – Must be installed on your system and available in your PATH  
  - *Ubuntu:* `sudo apt-get install ffmpeg`
  - *macOS:* `brew install ffmpeg`
  - *Windows:* Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.
- **npm packages:**  
  - [dotenv](https://www.npmjs.com/package/dotenv)  
  - [minimist](https://www.npmjs.com/package/minimist)  
  - [fluent-ffmpeg](https://www.npmjs.com/package/fluent-ffmpeg)  
  - [openai](https://www.npmjs.com/package/openai)

## Installation

1. **Clone the Repository**
   
   ```bash
   git clone https://github.com/Pavel40/brainrot.git
   cd brainrot
   ```

2. Install Node Dependencies If you are using pnpm (or npm/yarn):
   
   ```bash
   pnpm install
   ```
   
    or
   
   ```bash
   npm install
   ```

3. Install ffmpeg
   
    Follow the instructions above based on your operating system.

## Configuration

Create a .env file in the project root with the following:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Replace your_openai_api_key_here with your actual OpenAI API key.

## Folder Structure

- **index.js** - Main script.

- **study-material.txt** - File containing study material for text generation (used if no custom text is provided).

- **videos/** - Directory containing video background files (MP4 format).

- **output/** - Directory where generated files (voice.mp3, subtitles.srt, final_video.mp4) will be saved.

## CLI Usage

Run the script with Node and pass any desired options:

### Available CLI Options

- `--video, -v`  
  Specify the path to a custom video background file.  
  *Example:*
  
  ```
  node index.js --video path/to/background.mp4
  ```

- `--text, -t`  
  Provide custom voice-over text to use instead of generating text from the study material.  
  *Example:*
  
  ```
  node index.js --text "This is my custom voice-over text."
  ```

- `--bg, -b`  
  Specify the path to a background audio file (this audio will be mixed at a lower volume).  
  *Example:*
  
  ```
  node index.js --bg path/to/background_audio.mp3
  ```

- `--lang, -l`  
  Specify the language for the video. Supported values are:
  
  - `cz` (default, Czech)
  
  - `en` (English)
  
  - `de` (German)
  
  *Example:*
  
  ```
  node index.js --lang en
  ```

- `--help, -h`  
  Display the help message and exit.
  
  *Example:*
  
  ```
  node index.js --help
  ```

### Example Command

Generate a video with a custom video background, custom voice-over text, background audio, and in German:

```
node index.js --video ./videos/my_background.mp4 --text "Dies ist mein benutzerdefinierter Text für das Voice-over." --bg ./audio/bg.mp3 --lang de
```

If no options are provided, the script uses default configurations (random video from `videos/`, text generated from `study-material.txt`, default language Czech, and no background audio).




