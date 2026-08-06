const path = require('path');
const downloadService = require('./services/download.service');
const transcribeService = require('./services/transcribe.service');
const translateService = require('./services/translate.service');
const audioMixService = require('./services/audio-mix.service');
const captionService = require('./services/caption.service');
const thumbnailService = require('./services/thumbnail.service');

const VOICE = 'en-US-GuyNeural';

async function runPipeline(youtubeUrl) {
  console.log('1) تحميل الفيديو...');
  const { videoId, jobDir, videoPath, thumbPath } = await downloadService.downloadVideo(youtubeUrl);
  const metadata = await downloadService.getVideoMetadata(youtubeUrl);

  console.log('2) فصل الصوت الأصلي...');
  const audioPath = await downloadService.extractAudio(videoPath);

  console.log('3) تفريغ النص العربي...');
  const { segments } = await transcribeService.transcribeArabic(audioPath);

  console.log('4) ترجمة النص للإنجليزي...');
  const translated = await translateService.translateSegments(segments);

  console.log('5) توليد الصوت الإنجليزي لكل جملة...');
  const segmentFiles = await audioMixService.synthesizeSegments(translated, VOICE, jobDir);

  console.log('6) دمج المقاطع الصوتية...');
  const fullAudioPath = path.join(jobDir, 'full_audio_en.wav');
  const videoDuration = await audioMixService.getDuration(videoPath);
  await audioMixService.buildFullAudioTrack(segmentFiles, videoDuration, fullAudioPath);

  console.log('7) استبدال صوت الفيديو...');
  const dubbedVideoPath = path.join(jobDir, 'video_dubbed.mp4');
  await audioMixService.replaceAudio(videoPath, fullAudioPath, dubbedVideoPath);

  console.log('8) استخراج توقيت الكلمات للكابشن...');
  const words = await captionService.transcribeWordTimestamps(fullAudioPath);

  console.log('9) بناء وحرق الكابشن...');
  const assPath = path.join(jobDir, 'captions.ass');
  captionService.buildAssCaptions(words, assPath);
  const finalVideoPath = path.join(jobDir, 'video_final.mp4');
  await captionService.burnCaptions(dubbedVideoPath, assPath, finalVideoPath);

  console.log('10) تعديل الثمبنيل...');
  let finalThumbPath = thumbPath;
  if (thumbPath) {
    const titleEn = (await translateService.translateSegments([{ start: 0, end: 1, text: metadata.title }]))[0].textEn;
    const editedThumbPath = path.join(jobDir, 'thumbnail_en.jpg');
    const result = await thumbnailService.editThumbnail(thumbPath, titleEn, editedThumbPath);
    finalThumbPath = result.outputPath;
  }

  console.log('✅ الفيديو جاهز:', finalVideoPath);
  console.log('✅ الثمبنيل جاهز:', finalThumbPath);
  console.log('⏳ رفع اليوتيوب: راح يصير بخدمة منفصلة (upload.service.js)');

  return { videoId, finalVideoPath, finalThumbPath, metadata };
}

module.exports = { runPipeline };
