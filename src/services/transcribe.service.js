require('dotenv').config();
const fs = require('fs');
const Groq = require('groq-sdk');
const { withRetry } = require('./retry.util');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function transcribeArabic(audioPath) {
  const transcription = await withRetry(
    () =>
      groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-large-v3',
        language: 'ar',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      }),
    { label: 'تفريغ النص العربي (Whisper)' }
  );

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
