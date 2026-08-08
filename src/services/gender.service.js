const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);

// يقص مقطع صوتي من الملف الأصلي حسب البداية والنهاية، ويحلل الجنس المرجح للمتكلم
async function detectSegmentGender(audioPath, start, end, jobDir, index) {
  const clipPath = path.join(jobDir, `gender_clip_${index}.wav`);
  const duration = Math.max(0.2, end - start);

  try {
    await execAsync(
      `ffmpeg -y -i "${audioPath}" -ss ${start} -t ${duration} -ar 16000 -ac 1 "${clipPath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const script = path.join(__dirname, '..', 'python', 'detect_gender.py');
    const { stdout } = await execAsync(`python3 "${script}" "${clipPath}"`, {
      maxBuffer: 1024 * 1024 * 5,
    });

    return stdout.trim() === 'female' ? 'female' : 'male';
  } catch (err) {
    return 'male'; // عند أي مشكلة، افتراضي ولد
  }
}

// يحلل الجنس لكل جملة بمصفوفة segments ويرجعها بعد إضافة حقل gender
async function detectGendersForSegments(segments, audioPath, jobDir) {
  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const gender = await detectSegmentGender(audioPath, seg.start, seg.end, jobDir, i);
    results.push({ ...seg, gender });
  }
  return results;
}

module.exports = { detectSegmentGender, detectGendersForSegments };
