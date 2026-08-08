const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = promisify(exec);

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');
const COOKIES_PATH = path.join(__dirname, '..', '..', 'cookies.txt');
const COOKIES_FLAG = fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : '';

// يطلع video id من رابط يوتيوب
function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  if (!match) throw new Error('رابط يوتيوب غير صالح: ' + url);
  return match[1];
}

// يجهز مجلد خاص لهذا الفيديو داخل temp/
function getJobDir(videoId) {
  const dir = path.join(TEMP_DIR, videoId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// يجيب بيانات الفيديو (عنوان، وصف، ثمبنيل) بدون تحميل
async function getVideoMetadata(url) {
  const { stdout } = await execAsync(`yt-dlp --remote-components ejs:github ${COOKIES_FLAG} -j "${url}"`, { maxBuffer: 1024 * 1024 * 20 });
  const meta = JSON.parse(stdout);
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    duration: meta.duration,
    thumbnail: meta.thumbnail,
  };
}

// يحمّل الفيديو + الثمبنيل لمجلد temp/{videoId}/
async function downloadVideo(url) {
  const videoId = getVideoId(url);
  const jobDir = getJobDir(videoId);
  const videoPath = path.join(jobDir, 'video.mp4');
  const thumbPath = path.join(jobDir, 'thumbnail.jpg');

  await execAsync(
    `yt-dlp --remote-components ejs:github ${COOKIES_FLAG} -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]" -o "${videoPath}" --write-thumbnail --convert-thumbnails jpg "${url}"`,
    { maxBuffer: 1024 * 1024 * 50 }
  );

  // yt-dlp يحفظ الثمبنيل بنفس اسم الفيديو مع .jpg
  const expectedThumb = videoPath.replace('.mp4', '.jpg');
  if (fs.existsSync(expectedThumb) && expectedThumb !== thumbPath) {
    fs.renameSync(expectedThumb, thumbPath);
  }

  return { videoId, jobDir, videoPath, thumbPath: fs.existsSync(thumbPath) ? thumbPath : null };
}

// يفصل الصوت من الفيديو كملف WAV (16kHz mono - جاهز لـ Whisper)
async function extractAudio(videoPath) {
  const audioPath = videoPath.replace('video.mp4', 'audio.wav');
  await execAsync(
    `ffmpeg -y -i "${videoPath}" -vn -ar 16000 -ac 1 -c:a pcm_s16le "${audioPath}"`,
    { maxBuffer: 1024 * 1024 * 20 }
  );
  return audioPath;
}

module.exports = {
  getVideoId,
  getJobDir,
  getVideoMetadata,
  downloadVideo,
  extractAudio,
};
