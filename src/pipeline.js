const path = require('path');
const downloadService = require('./services/download.service');
const transcribeService = require('./services/transcribe.service');
const translateService = require('./services/translate.service');
const audioMixService = require('./services/audio-mix.service');
const genderService = require('./services/gender.service');
const captionService = require('./services/caption.service');
const thumbnailService = require('./services/thumbnail.service');
const textCardService = require('./services/text-card.service');
const uploadService = require('./services/upload.service');
const telegramService = require('./services/telegram.service');

const VOICES = { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' };

async function runPipeline(youtubeUrl) {
  let step = '0) بداية التشغيل';
  try {
    step = '1) تحميل الفيديو';
    console.log('1) تحميل الفيديو...');
    const { videoId, jobDir, videoPath, thumbPath } = await downloadService.downloadVideo(youtubeUrl);
    const metadata = await downloadService.getVideoMetadata(youtubeUrl);

    step = '2) فصل الصوت الأصلي';
    console.log('2) فصل الصوت الأصلي...');
    const audioPath = await downloadService.extractAudio(videoPath);

    step = '3) تفريغ النص العربي';
    console.log('3) تفريغ النص العربي...');
    const { segments } = await transcribeService.transcribeArabic(audioPath);

    step = '4) ترجمة النص للإنجليزي';
    console.log('4) ترجمة النص للإنجليزي...');
    const translated = await translateService.translateSegments(segments);

    step = '4.5) تحديد جنس المتحدث لكل جملة';
    console.log('4.5) تحديد جنس المتحدث لكل جملة...');
    const gendered = await genderService.detectGendersForSegments(segments, audioPath, jobDir);
    const translatedWithGender = translated.map((seg, i) => ({
      ...seg,
      gender: gendered[i]?.gender || 'male',
    }));

    step = '5) توليد الصوت الإنجليزي';
    console.log('5) توليد الصوت الإنجليزي لكل جملة...');
    const segmentFiles = await audioMixService.synthesizeSegments(translatedWithGender, VOICES, jobDir);

    step = '6) دمج المقاطع الصوتية';
    console.log('6) دمج المقاطع الصوتية...');
    const fullAudioPath = path.join(jobDir, 'full_audio_en.wav');
    const videoDuration = await audioMixService.getDuration(videoPath);
    await audioMixService.buildFullAudioTrack(segmentFiles, videoDuration, fullAudioPath);

    step = '7) استبدال صوت الفيديو';
    console.log('7) استبدال صوت الفيديو...');
    const dubbedVideoPath = path.join(jobDir, 'video_dubbed.mp4');
    await audioMixService.replaceAudio(videoPath, fullAudioPath, dubbedVideoPath);

    step = '8) استخراج توقيت الكلمات للكابشن';
    console.log('8) استخراج توقيت الكلمات للكابشن...');
    const words = await captionService.transcribeWordTimestamps(fullAudioPath);

    step = '9) بناء وحرق الكابشن';
    console.log('9) بناء وحرق الكابشن...');
    const assPath = path.join(jobDir, 'captions.ass');
    captionService.buildAssCaptions(words, assPath);
    let finalVideoPath = path.join(jobDir, 'video_final.mp4');
    await captionService.burnCaptions(dubbedVideoPath, assPath, finalVideoPath);

    // step = '9.5) استبدال الكتابة العربية المثبتة بالفيديو'; // معطّلة: كانت تخرب الفيديو
    // console.log('9.5) استبدال الكتابة العربية المثبتة بالفيديو...');
    // const rawCards = await textCardService.detectTextCards(videoPath, jobDir);
    // const editedCards = await textCardService.buildEditedCards(rawCards, jobDir);
    // const finalVideoPathWithCards = path.join(jobDir, 'video_final_cards.mp4');
    // await textCardService.overlayTextCards(finalVideoPath, editedCards, finalVideoPathWithCards);
    // finalVideoPath = finalVideoPathWithCards;

    step = '10) ترجمة وتدقيق العنوان + تعديل الثمبنيل';
    console.log('10) ترجمة وتدقيق العنوان + تعديل الثمبنيل...');
    let titleEn = (await translateService.translateSegments([{ start: 0, end: 1, text: metadata.title }]))[0].textEn;
    titleEn = await translateService.proofreadTitle(titleEn);

    let finalThumbPath = thumbPath;
    if (thumbPath) {
      const editedThumbPath = path.join(jobDir, 'thumbnail_en.jpg');
      const result = await thumbnailService.editThumbnail(thumbPath, titleEn, editedThumbPath);
      finalThumbPath = result.outputPath;
    }

    console.log('✅ الفيديو جاهز:', finalVideoPath);
    console.log('✅ الثمبنيل جاهز:', finalThumbPath);
    console.log('✅ العنوان بعد التدقيق:', titleEn);

    step = '11) رفع الفيديو على يوتيوب';
    console.log('11) رفع الفيديو على يوتيوب...');
    const descriptionEn = translated.map(seg => seg.textEn).join(' ').slice(0, 4900);
    const uploadResult = await uploadService.uploadVideo({
      videoPath: finalVideoPath,
      title: titleEn,
      description: descriptionEn,
      tags: [],
      thumbnailPath: finalThumbPath,
      privacyStatus: 'public',
    });

    console.log('✅ تم النشر:', uploadResult.url);

    return { videoId, finalVideoPath, finalThumbPath, metadata, uploadResult };
  } catch (error) {
    console.error(`❌ فشل بالخطوة: ${step}`, error);
    await telegramService.sendErrorAlert(step, error);
    throw error;
  }
}

module.exports = { runPipeline };
