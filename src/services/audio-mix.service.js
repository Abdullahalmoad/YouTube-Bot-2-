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

async function synthesizeSegments(segments, voices, jobDir) {
  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const rawPath = path.join(jobDir, `seg_${i}_raw.mp3`);
    const adjPath = path.join(jobDir, `seg_${i}.wav`);

    const voice = seg.gender === 'female' ? voices.female : voices.male;
    await captionService.generateSpeech(seg.textEn, voice, rawPath);
    const actualDur = await getDuration(rawPath);
    const targetDur = Math.max(0.3, seg.end - seg.start);
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
