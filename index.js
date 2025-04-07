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
        const prompt = `Jsi odborný copywriter specializující se na tvorbu textů pro voice-over videa. Na základě následujícího studijního materiálu vytvoř krátký, plynulý a zábavný text v češtině, který bude použit jako hlasový komentář ve videu. Ujisti se, že pokryješ všechny důležité informace obsažené ve studijním materiálu. Text by měl být informativní, poutavý a snadno srozumitelný. DŮLEŽITÉ: Ujisti se, že v textu se neobjeví žádné číslice. Všechna čísla, včetně letopočtů, musí být psána slovy. Například místo "1984" napiš "devatenáct set osmdesát čtyři".

    Studijní materiál:
    ${material}
    
    Ujisti se, že v celém textu nejsou žádné číslice, všechna čísla musí být přepsána výhradně slovy. Zejména letopočty jako 1984 musí být napsány jako 'devatenáct set osmdesát čtyři'.

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
        const unwantedChars = /[^\w\s.,!?;:()čřžýáíéěóúůšňďťě]/g; // Regex to match unwanted characters
        const cleanedText = text.replace(unwantedChars, '');

        return cleanedText;
    } catch (err) {
        console.error('Error processing study material with ChatGPT:', err);
        return '';
    }
}

async function generateVoice(text) {
    try {
        const mp3 = await openai.audio.speech.create({
            model: 'gpt-4o-mini-tts',
            voice: 'coral',
            input: text,
            instructions: 'Speak in a natural and clear Czech tone.',
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(OUTPUT_AUDIO, buffer);
        console.log('TTS audio generated and saved at', OUTPUT_AUDIO);
    } catch (error) {
        console.error('Error generating TTS audio:', error);
        throw error;
    }
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

async function generateSubtitles(originalVoiceoverText) {
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

        console.log('Initial generated subtitles:\n', srtContent);

        // Use ChatGPT to fix nonsensical words, typos, and mistakes.
        // The prompt compares the original voiceover text with the transcribed subtitles.
        const fixPrompt = `Jsi expert na korektury a úpravy titulků. Níže najdeš původní text, který byl použit pro generování hlasového komentáře, a automaticky transkribované titulky, které mohou obsahovat chyby, nesmyslná slova nebo překlepy. Prosím oprav titulky tak, aby odpovídaly původnímu textu a byly jazykově správné, ale zachovej původní indexy a časové značky ve formátu SRT.

Původní text pro hlasový komentář:
${originalVoiceoverText}

Automaticky generované titulky:
${srtContent}

Odpověz pouze výstupem v platném SRT formátu. Tvůj výstup musí být pouze opravený text SRT titulků. Opravené titulky (výstup v platném SRT formátu):`;

        const fixResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Jsi odborný editor titulků.' },
                { role: 'user', content: fixPrompt },
            ],
            max_tokens: 10000,
        });

        const correctedSrt = fixResponse.choices[0].message.content.trim();
        console.log('Corrected subtitles from ChatGPT:\n', correctedSrt);

        fs.writeFileSync(OUTPUT_SUBTITLES, correctedSrt, 'utf8');
        console.log('Subtitles generated at:', OUTPUT_SUBTITLES);
    } catch (err) {
        console.error('Error generating subtitles using Whisper and ChatGPT:', err);
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

    // Probe the input video to get its resolution.
    ffmpeg.ffprobe(inputVideoPath, (err, metadata) => {
        let width = 1920,
            height = 1080;
        if (!err && metadata && metadata.streams && metadata.streams[0]) {
            width = metadata.streams[0].width || width;
            height = metadata.streams[0].height || height;
        }
        // Set target resolution.
        const targetWidth = 1920;
        const targetHeight = 1080;

        // Build the video filter chain:
        // 1. Burn in the subtitles using the SRT file with forced style.
        // 2. Scale to the target resolution.
        // 3. Speed up video by a factor of 1.25.
        const vf = `subtitles='output/subtitles.srt':force_style='FontName=Comic Sans MS,FontSize=36,PrimaryColour=&H00FFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,original_size=${width}x${height}',scale=${targetWidth}:${targetHeight},setpts=PTS/1.25`;

        ffmpeg(inputVideoPath)
            .input(OUTPUT_AUDIO)
            // Map video from input 0 and audio from input 1.
            .outputOptions(['-shortest', '-map', '0:v', '-map', '1:a'])
            .videoFilter(vf)
            // Speed up the audio by 1.25x.
            .audioFilter('atempo=1.25')
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
        await generateSubtitles(studyText);
    } catch (error) {
        console.error('Failed to generate subtitles:', error);
        return;
    }
    createFinalVideo();
}

main();
