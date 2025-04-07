// index.js

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
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
        const prompt = `Jsi odborný copywriter specializující se na tvorbu textů pro voice-over videa. Na základě následujícího studijního materiálu vytvoř krátký, plynulý a zábavný text v češtině, který bude použit jako hlasový komentář ve videu. Ujisti se, že pokryješ všechny důležité informace obsažené ve studijním materiálu. Text by měl být informativní, poutavý a snadno srozumitelný, bez jakýchkoliv slangových výrazů.

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
        return text;
    } catch (err) {
        console.error('Error processing study material with ChatGPT:', err);
        return '';
    }
}

// Step 2: Convert the text into speech using Coqui TTS
async function generateVoice(text) {
    return new Promise((resolve, reject) => {
        // IMPORTANT:
        // - Ensure Coqui TTS is installed (https://github.com/coqui-ai/TTS)
        // - Replace <czech-model-path> with the actual path to your Czech-supported model.
        const command = `tts --text "${text.replace(
            /"/g,
            '\\"'
        )}" --model_name tts_models/cs/cv/vits --out_path ${OUTPUT_AUDIO}`;
        console.log('Executing command:', command);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error generating TTS audio:', error);
                return reject(error);
            }
            console.log('TTS generation stdout:', stdout);
            console.log('TTS generation stderr:', stderr);
            resolve();
        });
    });
}

// Step 3: Create subtitles file with timing for the voice-over text
function generateSubtitles(text) {
    // Splits the text into sentences and assigns dummy timings.
    const sentences = text.split('.').filter((s) => s.trim() !== '');
    let srtContent = '';
    let startTime = 0;
    const dummyDuration = 3000; // 3 seconds per sentence (dummy value)

    sentences.forEach((sentence, index) => {
        const endTime = startTime + dummyDuration;
        // Format time in SRT (HH:MM:SS,ms)
        const formatTime = (ms) => {
            const date = new Date(ms);
            return date.toISOString().substr(11, 12).replace('.', ',');
        };
        srtContent += `${index + 1}\n${formatTime(startTime)} --> ${formatTime(endTime)}\n${sentence.trim()}\n\n`;
        startTime = endTime;
    });

    fs.writeFileSync(OUTPUT_SUBTITLES, srtContent, 'utf8');
    console.log('Subtitles generated at:', OUTPUT_SUBTITLES);
}

// Step 4: Merge gameplay video, generated voice, and subtitles using ffmpeg
function createFinalVideo() {
    // For this example, we take the first video in the 'videos' folder
    const videoFiles = fs.readdirSync(VIDEOS_FOLDER).filter((file) => file.endsWith('.mp4'));
    if (videoFiles.length === 0) {
        console.error('No video files found in videos folder.');
        return;
    }
    const inputVideoPath = path.join(VIDEOS_FOLDER, videoFiles[0]);

    // Overlay the subtitles and add the generated audio.
    ffmpeg(inputVideoPath)
        .outputOptions('-vf', `subtitles=${OUTPUT_SUBTITLES}`)
        .input(OUTPUT_AUDIO)
        .output(OUTPUT_VIDEO)
        .on('end', () => {
            console.log('Final video created at:', OUTPUT_VIDEO);
        })
        .on('error', (err) => {
            console.error('Error creating final video:', err);
        })
        .run();
}

// Main workflow function
async function main() {
    const studyText = await getTextFromStudyMaterial();
    if (!studyText) return;

    return;

    try {
        await generateVoice(studyText);
    } catch (error) {
        console.error('Failed to generate voice:', error);
        return;
    }
    generateSubtitles(studyText);
    // Create the final video (after voice audio has been generated)
    createFinalVideo();
}

main();
