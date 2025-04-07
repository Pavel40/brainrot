// index.js

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurations
const STUDY_MATERIAL_PATH = path.join(__dirname, 'study-material.txt');
const VIDEOS_FOLDER = path.join(__dirname, 'videos');
const OUTPUT_AUDIO = path.join(__dirname, 'output', 'voice.mp3');
const OUTPUT_SUBTITLES = path.join(__dirname, 'output', 'subtitles.srt');
const OUTPUT_VIDEO = path.join(__dirname, 'output', 'final_video.mp4');
const LANGUAGE = 'cs'; // Czech language code

// Ensure output directory exists
if (!fs.existsSync(path.join(__dirname, 'output'))) {
    fs.mkdirSync(path.join(__dirname, 'output'));
}

// Initialize OpenAI API client using the new syntax and gpt-4o-mini model
const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
});

// Step 1: Transform study material into plain voice-over text using ChatGPT with gpt-4o-mini
async function getTextFromStudyMaterial() {
    try {
        const material = fs.readFileSync(STUDY_MATERIAL_PATH, 'utf8');
        const prompt = `Jsi odborný copywriter specializující se na tvorbu textů pro voice-over videa. Na základě následujícího studijního materiálu vytvoř krátký, plynulý a zábavný text v češtině, který bude použit jako hlasový komentář ve videu. Ujisti se, že pokryješ všechny důležité informace obsažené ve studijním materiálu. Text by měl být informativní, poutavý a snadno srozumitelný. DŮLEŽITÉ: Prosím, piš všechna čísla slovy a nepoužívej číselné zápisy ani ordinal markery (např. místo "1." použij "první").

    Studijní materiál:
    ${material}
    
    Výstup:`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Jsi odborný copywriter pro voice-over videa.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 1000,
        });

        const text = response.choices[0].message.content.trim();
        console.log('Generated voice-over text from ChatGPT:');
        console.log(text);

        // remove all markdown formatting and unwanted characters, keep czech letters
        const unwantedChars = /[^\w\s.,!?;:()čřžýáíéěóúůňďťě]/g; // Regex to match unwanted characters
        const cleanedText = text.replace(unwantedChars, '');

        return cleanedText;
    } catch (err) {
        console.error('Error processing study material with ChatGPT:', err);
        return '';
    }
}

async function generateVoice(text) {
    return new Promise((resolve, reject) => {
        const args = [
            '--text',
            text,
            '--model_name',
            'tts_models/multilingual/multi-dataset/xtts_v2',
            '--language_idx',
            'cs',
            '--speaker_wav',
            'babis.wav',
            '--out_path',
            OUTPUT_AUDIO,
        ];
        console.log('Executing command: tts ' + args.join(' '));

        // Set environment variables for Czech UTF-8 encoding
        const spawnOptions = {
            env: { ...process.env, LC_ALL: 'cs_CZ.UTF-8', LANG: 'cs_CZ.UTF-8' },
        };

        const ttsProcess = spawn('tts', args, spawnOptions);

        let stdoutData = '';
        let stderrData = '';

        ttsProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        ttsProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        ttsProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('Error generating TTS audio. Exit code:', code);
                console.error(stderrData);
                return reject(new Error(`TTS process exited with code: ${code}`));
            }
            console.log('TTS generation stdout:', stdoutData);
            console.log('TTS generation stderr:', stderrData);
            resolve();
        });
    });
}

// Helper: Format seconds into SRT time format "HH:MM:SS,mmm"
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(
        ms
    ).padStart(3, '0')}`;
}

// Step 3: Generate subtitles using OpenAI Whisper (transcription) and split into smaller chunks.
async function generateSubtitles() {
    try {
        // Use OpenAI Whisper transcription API to transcribe the generated audio.
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(OUTPUT_AUDIO),
            model: 'whisper-1',
            response_format: 'verbose_json',
        });

        const segments = transcription.segments;
        if (!segments || segments.length === 0) {
            throw new Error('No transcription segments were returned.');
        }

        let srtContent = '';
        let subtitleIndex = 1;
        const maxWordsPerChunk = 7; // Maximum words per subtitle chunk

        segments.forEach((segment) => {
            // Clean and split the segment text into words.
            const words = segment.text.trim().split(/\s+/);
            const totalWords = words.length;
            if (totalWords === 0) return;

            const segDuration = segment.end - segment.start;
            let currentTime = segment.start;

            // Process the segment in chunks of maxWordsPerChunk words.
            for (let i = 0; i < totalWords; i += maxWordsPerChunk) {
                const chunkWords = words.slice(i, i + maxWordsPerChunk);
                const chunkWordCount = chunkWords.length;
                // Proportionally allocate the chunk duration.
                const chunkDuration = segDuration * (chunkWordCount / totalWords);
                const chunkStart = currentTime;
                const chunkEnd = currentTime + chunkDuration;
                const chunkText = chunkWords.join(' ');

                srtContent += `${subtitleIndex}\n${formatTime(chunkStart)} --> ${formatTime(
                    chunkEnd
                )}\n${chunkText}\n\n`;
                subtitleIndex++;
                currentTime = chunkEnd;
            }
        });

        fs.writeFileSync(OUTPUT_SUBTITLES, srtContent, 'utf8');
        console.log('Subtitles generated at:', OUTPUT_SUBTITLES);
    } catch (err) {
        console.error('Error generating subtitles using Whisper:', err);
        throw err;
    }
}

function createFinalVideo() {
    const videoFiles = fs.readdirSync(VIDEOS_FOLDER).filter((file) => file.endsWith('.mp4'));
    if (videoFiles.length === 0) {
        console.error('No video files found in videos folder.');
        return;
    }
    const inputVideoPath = path.join(VIDEOS_FOLDER, videoFiles[0]);
    // Convert the subtitles path to forward slashes for FFmpeg.
    const subtitlesPath = OUTPUT_SUBTITLES.replace(/\\/g, '/');

    // Probe the input video to get its resolution.
    ffmpeg.ffprobe(inputVideoPath, (err, metadata) => {
        let width = 1920,
            height = 1080;
        if (!err && metadata && metadata.streams && metadata.streams[0]) {
            width = metadata.streams[0].width || width;
            height = metadata.streams[0].height || height;
        }
        // Build the video filter string.
        // Note: original_size is set to the input video's resolution.
        const vf = `subtitles='output/subtitles.srt':force_style='FontName=Comic Sans MS,FontSize=36,PrimaryColour=&H00FFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,original_size=${width}x${height}'`;
        // const vf = `subtitles='output/subtitles.srt'`;

        ffmpeg(inputVideoPath)
            .input(OUTPUT_AUDIO)
            // Explicitly map the video from the first input and audio from the second input.
            .outputOptions(['-shortest', '-map', '0:v', '-map', '1:a'])
            .videoFilter(vf)
            .output(OUTPUT_VIDEO)
            .on('end', () => {
                console.log('Final video created at:', OUTPUT_VIDEO);
            })
            .on('error', (err) => {
                console.error('Error creating final video:', err);
            })
            .run();
    });
}

// Main workflow function
async function main() {
    const studyText = await getTextFromStudyMaterial();
    if (!studyText) return;

    try {
        await generateVoice(studyText);
    } catch (error) {
        console.error('Failed to generate voice:', error);
        return;
    }
    try {
        await generateSubtitles();
    } catch (error) {
        console.error('Failed to generate subtitles:', error);
        return;
    }
    createFinalVideo();
}

main();
