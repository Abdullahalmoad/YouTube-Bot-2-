require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const { withRetry } = require('./retry.util');
const execAsync = promisify(exec);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateSpeech(text, voice, outPath) {
  const script = path.join(__dirname, '..', 'python', 'generate_tts.py');
  const escaped = text.replace(/"/g, '\\"');
  await execAsync(`python3 "${script}" "${escaped}" "${voice}" "${outPath}"`, {
    maxBuffer: 1024 * 1024 * 20,
  });
  return outPath;
}

async function compressForWhisper(audioPath) {
  const compressedPath = audioPath.replace(/\.[^.]+$/, '_whisper.mp3');
  await execAsync(
    `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -c:a libmp3lame -b:a 32k "${compressedPath}"`,
    { maxBuffer: 1024 * 1024 * 20 }
  );
  return compressedPath;
}

async function transcribeWordTimestamps(audioPath) {
  const compressedPath = await compressForWhisper(audioPath);
  try {
    const transcription = await withRetry(
      () =>
        groq.audio.transcriptions.create({
          file: fs.createReadStream(compressedPath),
          model: 'whisper-large-v3',
          response_format: 'verbose_json',
          timestamp_granularities: ['word'],
        }),
      { label: 'استخراج توقيت الكلمات (Whisper)' }
    );
    return transcription.words || [];
  } finally {
    fs.unlink(compressedPath, () => {});
  }
}

function secToAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function buildAssCaptions(words, outputPath, opts = {}) {
  const {
    wordByWord = true,
    maxWordsPerLine = 6,
    maxLineDuration = 3.0,
    minWordDuration = 0.20,
    resX = 1920,
    resY = 1080,
    fontSize = 90,
    marginV = 250,
  } = opts;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${resX}
PlayResY: ${resY}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial,${fontSize},&H00FFFFFF,&H0000D7FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,4,0,2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events;

  if (wordByWord) {
    events = words.map((w, i) => {
      let start = w.start;
      let end = w.end;
      if (end - start < minWordDuration) end = start + minWordDuration;
      const next = words[i + 1];
      if (next && next.start > end) end = Math.min(next.start, end + 0.15);
      const text = `{\\fscx110\\fscy110}${w.word.trim()}`;
      return `Dialogue: 0,${secToAssTime(start)},${secToAssTime(end)},Karaoke,,0,0,0,,${text}`;
    });
  } else {
    const lines = [];
    let current = [];
    let lineStart = null;

    for (const w of words) {
      if (current.length === 0) lineStart = w.start;
      current.push(w);
      const dur = w.end - lineStart;
      if (current.length >= maxWordsPerLine || dur >= maxLineDuration) {
        lines.push(current);
        current = [];
      }
    }
    if (current.length) lines.push(current);

    events = lines.map((line) => {
      const start = line[0].start;
      const end = line[line.length - 1].end;
      let prevEnd = start;
      let text = '';
      for (const w of line) {
        const durCs = Math.max(1, Math.round((w.end - prevEnd) * 100));
        text += `{\\kf${durCs}}${w.word.trim()} `;
        prevEnd = w.end;
      }
      return `Dialogue: 0,${secToAssTime(start)},${secToAssTime(end)},Karaoke,,0,0,0,,${text.trim()}`;
    });
  }

  fs.writeFileSync(outputPath, header + events.join('\n'), 'utf-8');
  return outputPath;
}

async function burnCaptions(videoPath, assPath, outputPath) {
  await execAsync(
    `ffmpeg -y -i "${videoPath}" -vf "ass=${assPath}" -c:a copy "${outputPath}"`,
    { maxBuffer: 1024 * 1024 * 50 }
  );
  return outputPath;
}

module.exports = {
  generateSpeech,
  transcribeWordTimestamps,
  buildAssCaptions,
  burnCaptions,
  secToAssTime,
};
