require('dotenv').config();
const fs = require('fs');
const path = require('path');
const telegramService = require('./services/telegram.service');
const { runPipeline } = require('./pipeline');

const OFFSET_FILE = path.join(__dirname, '..', '.state', 'offset.txt');
const PROCESSED_FILE = path.join(__dirname, '..', '.state', 'processed.json');

function readOffset() {
  try {
    return parseInt(fs.readFileSync(OFFSET_FILE, 'utf8').trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function writeOffset(offset) {
  fs.mkdirSync(path.dirname(OFFSET_FILE), { recursive: true });
  fs.writeFileSync(OFFSET_FILE, String(offset));
}

function readProcessed() {
  try {
    return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function writeProcessed(set) {
  fs.mkdirSync(path.dirname(PROCESSED_FILE), { recursive: true });
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...set], null, 2));
}

function extractVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{6,})/);
  return match ? match[1] : url;
}

async function main() {
  let offset = readOffset();
  const processed = readProcessed();
  const updates = await telegramService.getUpdates(offset);

  if (!updates || updates.length === 0) {
    console.log('لا توجد رسائل جديدة');
    return;
  }

  let lastLinkMessage = null;
  let sawStart = false;
  let startChatId = null;

  for (const update of updates) {
    offset = update.update_id + 1;
    const message = update.message;
    if (!message || !message.text) continue;

    const text = message.text.trim();
    const chatId = message.chat.id;

    if (text === '/start') {
      sawStart = true;
      startChatId = chatId;
      continue;
    }

    const url = telegramService.extractYoutubeUrl(text);
    if (!url) continue;

    lastLinkMessage = { chatId, url };
  }

  if (sawStart && startChatId) {
    await telegramService.sendMessage(startChatId, '👋 أهلاً! ابعت لي رابط فيديو يوتيوب وراح أدبلجه وأرفعه تلقائياً.');
  }

  if (!lastLinkMessage) {
    writeOffset(offset);
    console.log('ما فيه روابط يوتيوب بهالدفعة. offset تحدث إلى:', offset);
    return;
  }

  const { chatId, url } = lastLinkMessage;
  const videoId = extractVideoId(url);

  if (processed.has(videoId)) {
    console.log(`الفيديو ${videoId} مسوى له فيديو من قبل، تجاوزته.`);
    writeOffset(offset);
    return;
  }

  try {
    await telegramService.sendMessage(chatId, '🚀 استلمت الرابط، بدأت المعالجة...');
    const result = await runPipeline(url);
    await telegramService.sendMessage(chatId, `✅ خلص الرفع على يوتيوب:\n${result.uploadResult.url}`);
    processed.add(videoId);
    writeProcessed(processed);
  } catch (error) {
    console.error('فشل تنفيذ البايبلاين:', error.message);
  }

  writeOffset(offset);
  console.log('تم تحديث offset إلى:', offset);
}

main().catch(async (err) => {
  console.error('خطأ عام:', err.message);
  await telegramService.sendErrorAlert('فحص الرسائل (check-once)', err);
  process.exit(1);
});
