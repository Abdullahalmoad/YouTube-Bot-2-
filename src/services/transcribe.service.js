require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const Groq = require('groq-sdk');
const { withRetry } = require('./retry.util');
const execAsync = promisify(exec);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function compressForWhisper(audioPath) {
  const compressedPath = audioPath.replace(/\.[^.]+$/, '_whisper.mp3');
  await execAsync(
    `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -c:a libmp3lame -b:a 32k "${compressedPath}"`,
    { maxBuffer: 1024 * 1024 * 20 }
  );
  return compressedPath;
}

async function transcribeArabic(audioPath) {
  const compressedPath = await compressForWhisper(audioPath);
  let transcription;
  try {
    transcription = await withRetry(
      () =>
        groq.audio.transcriptions.create({
          file: fs.createReadStream(compressedPath),
          model: 'whisper-large-v3',
          language: 'ar',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        }),
      { label: 'تفريغ النص العربي (Whisper)' }
    );
  } finally {
    fs.unlink(compressedPath, () => {});
  }

  const segments = (transcription.segments || []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));

  return {
    fullText: transcription.text,
    segments,
    duration: transcription.duration,
  };
}

module.exports = {
  transcribeArabic,
};
