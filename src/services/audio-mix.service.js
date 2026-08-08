const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = promisify(exec);
const captionService = require('./caption.service');

async function getDuration(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`
  );
  return parseFloat(stdout.trim());
}

// يحاول توليد الصوت عدة مرات، ويتأكد إنه الملف مو فاضي/تالف
async function generateSpeechWithRetry(text, voice, outPath, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await captionService.generateSpeech(text, voice, outPath);
      const stat = fs.existsSync(outPath) ? fs.statSync(outPath) : null;
      if (stat && stat.size > 500) {
        return true;
      }
      console.warn(`⚠️ الصوت طلع فارغ/تالف (محاولة ${i}/${attempts})، إعادة محاولة...`);
    } catch (err) {
      console.warn(`⚠️ فشل توليد الصوت (محاولة ${i}/${attempts}): ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// ينشئ مقطع صمت بالمدة المطلوبة (حل بديل لو فشل توليد الصوت نهائياً)
async function createSilence(durationSec, outPath) {
  await execAsync(
    `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${durationSec} "${outPath}"`,
    { maxBuffer: 1024 * 1024 * 5 }
  );
}

async function synthesizeSegments(segments, voices, jobDir) {
  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const rawPath = path.join(jobDir, `seg_${i}_raw.mp3`);
    const adjPath = path.join(jobDir, `seg_${i}.wav`);
    const targetDur = Math.max(0.3, seg.end - seg.start);

    const voice = seg.gender === 'female' ? voices.female : voices.male;
    const ok = await generateSpeechWithRetry(seg.textEn, voice, rawPath);

    if (!ok) {
      console.warn(`⚠️ تعذر توليد صوت الجملة ${i + 1} نهائياً، رح نستخدم صمت بمكانها`);
      await createSilence(targetDur, adjPath);
      results.push({ path: adjPath, start: seg.start });
      continue;
    }

    const actualDur = await getDuration(rawPath);
    let tempo = actualDur / targetDur;
    tempo = Math.min(2.0, Math.max(0.5, tempo));

    await execAsync(
      `ffmpeg -y -i "${rawPath}" -filter:a "atempo=${tempo.toFixed(3)}" -ar 44100 "${adjPath}"`,
      { maxBuffer: 1024 * 1024 * 20 }
    );

    results.push({ path: adjPath, start: seg.start });
  }
  return results;
}

async function buildFullAudioTrack(segmentFiles, totalDuration, outputPath) {
  const inputs = segmentFiles.map((s) => `-i "${s.path}"`).join(' ');
  const delays = segmentFiles
    .map((s, i) => `[${i}]adelay=${Math.round(s.start * 1000)}|${Math.round(s.start * 1000)}[a${i}]`)
    .join(';');
  const mixInputs = segmentFiles.map((_, i) => `[a${i}]`).join('');
  const filter = `${delays};${mixInputs}amix=inputs=${segmentFiles.length}:duration=longest:normalize=0[out]`;

  await execAsync(
    `ffmpeg -y ${inputs} -filter_complex "${filter}" -map "[out]" -t ${totalDuration} "${outputPath}"`,
    { maxBuffer: 1024 * 1024 * 50 }
  );
  return outputPath;
}

async function replaceAudio(videoPath, audioPath, outputPath) {
  await execAsync(
    `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${outputPath}"`,
    { maxBuffer: 1024 * 1024 * 50 }
  );
  return outputPath;
}

module.exports = { synthesizeSegments, buildFullAudioTrack, replaceAudio, getDuration };
