// index.js

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';
import minimist from 'minimist';

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurations
const STUDY_MATERIAL_PATH = path.join(__dirname, 'study-material.txt');
const VIDEOS_FOLDER = path.join(__dirname, 'videos');
const OUTPUT_AUDIO = path.join(__dirname, 'output', 'voice.mp3');
const OUTPUT_SUBTITLES = path.join(__dirname, 'output', 'subtitles.srt');
const OUTPUT_VIDEO = path.join(__dirname, 'output', 'final_video.mp4');

// Ensure output directory exists
if (!fs.existsSync(path.join(__dirname, 'output'))) {
    fs.mkdirSync(path.join(__dirname, 'output'));
}

// Initialize OpenAI API client using the new syntax and gpt-4o-mini model
const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
});

// ---------------------------------------------------------------------------
// Parse CLI options using minimist.
const cliOptions = minimist(process.argv.slice(2), {
    string: ['video', 'text', 'bg', 'lang'],
    boolean: ['help'],
    alias: { v: 'video', t: 'text', b: 'bg', l: 'lang', h: 'help' },
});

// If help option is present, display usage information and exit.
if (cliOptions.help) {
    console.log(`
Usage: node index.js [options]

Options:
  --video, -v   Path to a custom video background file.
  --text, -t    Custom voice-over text to use instead of generating from study material.
  --bg, -b      Path to a background audio file (will be mixed at low volume).
  --lang, -l    Language to use (default: cz). Supported values: cz, en, de.
  --help, -h    Show this help message.
    `);
    process.exit(0);
}

// Language selection: default is Czech ("cz")
let languageOption = cliOptions.lang ? cliOptions.lang.toLowerCase() : 'cz';
console.log(`Language set to: ${languageOption}`);

// Video background selection.
let selectedVideoPath;
if (cliOptions.video) {
    selectedVideoPath = path.resolve(cliOptions.video);
    if (!fs.existsSync(selectedVideoPath)) {
        console.error(`The specified video file does not exist: ${selectedVideoPath}`);
        process.exit(1);
    }
    console.log(`Using video background from CLI: ${selectedVideoPath}`);
} else {
    // Choose a random video from the VIDEOS_FOLDER.
    const videoFiles = fs.readdirSync(VIDEOS_FOLDER).filter((file) => file.endsWith('.mp4'));
    if (videoFiles.length === 0) {
        console.error('No video files found in videos folder.');
        process.exit(1);
    }
    const randomIndex = Math.floor(Math.random() * videoFiles.length);
    selectedVideoPath = path.join(VIDEOS_FOLDER, videoFiles[randomIndex]);
    console.log(`No video specified. Randomly selected video: ${selectedVideoPath}`);
}

// Custom text selection.
let customText = '';
if (cliOptions.text) {
    customText = cliOptions.text;
    console.log('Using custom text provided via CLI.');
}

// Background audio selection.
let bgAudioPath = '';
if (cliOptions.bg) {
    bgAudioPath = path.resolve(cliOptions.bg);
    if (!fs.existsSync(bgAudioPath)) {
        console.error(`The specified background audio file does not exist: ${bgAudioPath}`);
        process.exit(1);
    }
    console.log(`Using background audio from CLI: ${bgAudioPath}`);
}

// ---------------------------------------------------------------------------
// Function to generate the voice-over text from study material.
async function getTextFromStudyMaterial() {
    try {
        const material = fs.readFileSync(STUDY_MATERIAL_PATH, 'utf8');
        let prompt = '';
        if (languageOption === 'en') {
            prompt = `You are a professional copywriter specializing in writing scripts for voice-over videos. Based on the following study material, create a short, fluent, and entertaining text in English that will be used as the voice-over commentary in a video. Make sure to cover all important information from the study material. The text should be informative, engaging, and easy to understand. IMPORTANT: Make sure that no digits appear in the text. All numbers, including years, must be written in words. For example, instead of "1984", write "nineteen eighty-four".

Study material:
${material}

Ensure there are no digits anywhere in the text; all numbers must be written in words.
Output:`;
        } else if (languageOption === 'de' || languageOption === 'german') {
            prompt = `Du bist ein professioneller Werbetexter, der sich auf das Schreiben von Skripten für Voice-Over-Videos spezialisiert hat. Basierend auf dem folgenden Studienmaterial erstelle einen kurzen, fließenden und unterhaltsamen Text in deutscher Sprache, der als Kommentar in einem Video verwendet wird. Achte darauf, alle wichtigen Informationen des Studienmaterials einzubeziehen. Der Text soll informativ, ansprechend und leicht verständlich sein. WICHTIG: Stelle sicher, dass keine Ziffern im Text vorkommen. Alle Zahlen, einschließlich Jahreszahlen, müssen ausgeschrieben werden. Zum Beispiel, statt "1984" schreibe "neunzehnhundertvierundachtzig".

Studienmaterial:
${material}

Stelle sicher, dass im gesamten Text keine Ziffern vorkommen und alle Zahlen ausgeschrieben werden.
Ausgabe:`;
        } else {
            // Default: Czech
            prompt = `Jsi odborný copywriter specializující se na tvorbu textů pro voice-over videa. Na základě následujícího studijního materiálu vytvoř krátký, plynulý a zábavný text v češtině, který bude použit jako hlasový komentář ve videu. Ujisti se, že pokryješ všechny důležité informace obsažené ve studijním materiálu. Text by měl být informativní, poutavý a snadno srozumitelný. DŮLEŽITÉ: Ujisti se, že v textu se neobjeví žádné číslice. Všechna čísla, včetně letopočtů, musí být psána slovy. Například místo "1984" napiš "devatenáct set osmdesát čtyři".

Studijní materiál:
${material}

Ujisti se, že v celém textu nejsou žádné číslice, všechna čísla musí být přepsána výhradně slovy. Zejména letopočty jako 1984 musí být napsány jako 'devatenáct set osmdesát čtyři'.

Výstup:`;
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content:
                        languageOption === 'en'
                            ? 'You are a professional copywriter for voice-over videos.'
                            : languageOption === 'de' || languageOption === 'german'
                            ? 'Du bist ein professioneller Werbetexter für Voice-Over-Videos.'
                            : 'Jsi odborný copywriter pro voice-over videa.',
                },
                { role: 'user', content: prompt },
            ],
            max_tokens: 10000,
        });

        const text = response.choices[0].message.content.trim();
        console.log('Generated voice-over text from ChatGPT:');
        console.log(text);

        // Remove all markdown formatting and unwanted characters, keeping Czech letters and basic Latin letters.
        const unwantedChars = /[^\w\s.,!?;:()čřžýáíéěóúůšňďťěA-Za-z]/g;
        const cleanedText = text.replace(unwantedChars, '');
        return cleanedText;
    } catch (err) {
        console.error('Error processing study material with ChatGPT:', err);
        return '';
    }
}

// ---------------------------------------------------------------------------
// Function to generate TTS audio using OpenAI's text-to-speech API.
async function generateVoice(text) {
    try {
        let voiceInstructions;
        if (languageOption === 'en') {
            voiceInstructions = 'Speak in a natural and clear English tone.';
        } else if (languageOption === 'de' || languageOption === 'german') {
            voiceInstructions = 'Speak in a natural and clear German tone.';
        } else {
            voiceInstructions = 'Speak in a natural and clear Czech tone.';
        }
        const mp3 = await openai.audio.speech.create({
            model: 'gpt-4o-mini-tts',
            voice: 'coral',
            input: text,
            instructions: voiceInstructions,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(OUTPUT_AUDIO, buffer);
        console.log('TTS audio generated and saved at', OUTPUT_AUDIO);
    } catch (error) {
        console.error('Error generating TTS audio:', error);
        throw error;
    }
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Function to generate subtitles by combining Whisper transcription and ChatGPT correction.
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
        const maxWordsPerChunk = 4; // Maximum words per subtitle chunk

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

        // Build the fix prompt according to the selected language.
        let fixPrompt = '';
        if (languageOption === 'en') {
            fixPrompt = `You are an expert in editing subtitles. Below is the original text used for generating the voice-over, and the automatically transcribed subtitles which may contain errors, typos, or nonsensical words. Please fix the subtitles so that they accurately reflect the original text and are grammatically correct, while preserving the original indices and time codes in valid SRT format.

Original text for the voice-over:
${originalVoiceoverText}

Automatically generated subtitles:
${srtContent}

Provide only the corrected subtitles in valid SRT format:`;
        } else if (languageOption === 'de' || languageOption === 'german') {
            fixPrompt = `Du bist ein Experte für die Bearbeitung von Untertiteln. Unten findest du den Originaltext, der für die Erstellung des Voice-over verwendet wurde, und die automatisch transkribierten Untertitel, die Fehler, Tippfehler oder unsinnige Wörter enthalten können. Bitte korrigiere die Untertitel so, dass sie dem Originaltext genau entsprechen und grammatikalisch korrekt sind, wobei die ursprünglichen Indizes und Zeitcodes im gültigen SRT-Format erhalten bleiben.

Originaltext für das Voice-over:
${originalVoiceoverText}

Automatisch generierte Untertitel:
${srtContent}

Gib nur die korrigierten Untertitel im gültigen SRT-Format aus:`;
        } else {
            // Default: Czech
            fixPrompt = `Jsi expert na korektury a úpravy titulků. Níže najdeš původní text, který byl použit pro generování hlasového komentáře, a automaticky transkribované titulky, které mohou obsahovat chyby, překlepy nebo nesmyslná slova. Prosím oprav titulky tak, aby odpovídaly původnímu textu a byly jazykově správné, ale zachovej původní indexy a časové značky ve formátu SRT.

Původní text pro hlasový komentář:
${originalVoiceoverText}

Automaticky generované titulky:
${srtContent}

Odpověz pouze opravenými titulky (výstup v platném SRT formátu):`;
        }

        const fixResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content:
                        languageOption === 'en'
                            ? 'You are an expert subtitle editor.'
                            : languageOption === 'de' || languageOption === 'german'
                            ? 'Du bist ein Experte für Untertitel.'
                            : 'Jsi odborný editor titulků.',
                },
                { role: 'user', content: fixPrompt },
            ],
            max_tokens: 10000,
        });

        let correctedSrt = fixResponse.choices[0].message.content.trim();
        // Remove any code block markers like "```srt" and "```"
        correctedSrt = correctedSrt
            .replace(/```srt\s*/gi, '')
            .replace(/```/gi, '')
            .trim();
        console.log('Corrected subtitles from ChatGPT:\n', correctedSrt);

        // Convert subtitles to all uppercase.
        correctedSrt = correctedSrt.toUpperCase();

        fs.writeFileSync(OUTPUT_SUBTITLES, correctedSrt, 'utf8');
        console.log('Subtitles generated at:', OUTPUT_SUBTITLES);
    } catch (err) {
        console.error('Error generating subtitles using Whisper and ChatGPT:', err);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Function to create final video, using the selected video background and optional background audio.
// The output video keeps the original video size and centers the subtitles.
function createFinalVideo(selectedVideoPath, bgAudioPath) {
    // Probe the input video to get its resolution.
    ffmpeg.ffprobe(selectedVideoPath, (err, metadata) => {
        if (err) {
            console.error('Error probing video:', err);
            return;
        }
        // Find the first video stream.
        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        if (!videoStream) {
            console.error('No video stream found in metadata.');
            return;
        }
        const width = videoStream.width;
        const height = videoStream.height;

        // Build the video filter string:
        // 1. Burn in the subtitles using the SRT file with forced style.
        //    - Use Alignment=10 to center subtitles both horizontally and vertically.
        //    - Use the actual video dimensions as original_size.
        // 2. Speed up video by a factor of 1.25.
        const vf = `subtitles='output/subtitles.srt':force_style='FontName=Comic Sans MS,FontSize=22,PrimaryColour=&H0000FFFF,OutlineColour=&H000000,Outline=2,Alignment=10,original_size=${width}x${height}',setpts=PTS/1.25`;

        if (bgAudioPath) {
            // If a background audio file is provided, mix it with the TTS audio.
            // Both audio inputs are sped up by 1.25 using atempo filter.
            const complexFilter =
                '[1:a]atempo=1.25,volume=1[voice];[2:a]atempo=1.25,volume=0.15[bg];[voice][bg]amix=inputs=2:duration=shortest:dropout_transition=0[mixed]';
            ffmpeg(selectedVideoPath)
                .input(OUTPUT_AUDIO)
                .input(bgAudioPath)
                .complexFilter(complexFilter)
                .outputOptions(['-shortest', '-map', '0:v', '-map', '[mixed]'])
                .videoFilter(vf)
                .output(OUTPUT_VIDEO)
                .on('end', () => {
                    console.log('Final video created at:', OUTPUT_VIDEO);
                })
                .on('error', (err) => {
                    console.error('Error creating final video:', err);
                })
                .run();
        } else {
            // No background audio provided: use TTS audio only.
            ffmpeg(selectedVideoPath)
                .input(OUTPUT_AUDIO)
                // Map video from background and audio from TTS.
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
        }
    });
}

// ---------------------------------------------------------------------------
// Main workflow function.
async function main() {
    let studyText = '';
    if (customText && customText.trim().length > 0) {
        studyText = customText;
        console.log('Using custom provided text for voice-over.');
    } else {
        studyText = await getTextFromStudyMaterial();
    }
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
    createFinalVideo(selectedVideoPath, bgAudioPath);
}

main();
