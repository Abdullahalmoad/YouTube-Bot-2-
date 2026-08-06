require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const execAsync = promisify(exec);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// يولد صوت إنجليزي عبر Edge-TTS (بايثون)
async function generateSpeech(text, voice, outPath) {
  const script = path.join(__dirname, '..', 'python', 'generate_tts.py');
  const escaped = text.replace(/"/g, '\\"');
  await execAsync(`python3 "${script}" "${escaped}" "${voice}" "${outPath}"`, {
    maxBuffer: 1024 * 1024 * 20,
  });
  return outPath;
}

// يحلل الصوت عبر Groq Whisper ويرجع توقيت دقيق لكل كلمة
async function transcribeWordTimestamps(audioPath) {
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });
  return transcription.words || [];
}

function secToAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

// يبني ملف ترجمة ASS بتأثير كاريوكي (كلمة تتلون ذهبي وقت نطقها)
function buildAssCaptions(words, outputPath, opts = {}) {
  const {
    maxWordsPerLine = 6,
    maxLineDuration = 3.0,
    resX = 1920,
    resY = 1080,
    fontSize = 72,
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

  const events = lines.map((line) => {
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

  fs.writeFileSync(outputPath, header + events.join('\n'), 'utf-8');
  return outputPath;
}

// يحرق ملف الترجمة فوق الفيديو
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
