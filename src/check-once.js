require('dotenv').config();
const fs = require('fs');
const path = require('path');
const telegramService = require('./services/telegram.service');
const { runPipeline } = require('./pipeline');

const OFFSET_FILE = path.join(__dirname, '..', '.state', 'offset.txt');

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

async function main() {
  let offset = readOffset();
  const updates = await telegramService.getUpdates(offset);

  if (!updates || updates.length === 0) {
    console.log('لا توجد رسائل جديدة');
    return;
  }

  for (const update of updates) {
    offset = update.update_id + 1;
    const message = update.message;
    if (!message || !message.text) continue;

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (text === '/start') {
      await telegramService.sendMessage(chatId, '👋 أهلاً! ابعت لي رابط فيديو يوتيوب وراح أدبلجه وأرفعه تلقائياً.');
      continue;
    }

    const url = telegramService.extractYoutubeUrl(text);
    if (!url) continue;

    try {
      await telegramService.sendMessage(chatId, '🚀 استلمت الرابط، بدأت المعالجة...');
      const result = await runPipeline(url);
      await telegramService.sendMessage(chatId, `✅ خلص الرفع على يوتيوب:\n${result.uploadResult.url}`);
    } catch (error) {
      console.error('فشل تنفيذ البايبلاين:', error.message);
    }
  }

  writeOffset(offset);
  console.log('تم تحديث offset إلى:', offset);
}

main().catch((err) => {
  console.error('خطأ عام:', err.message);
  process.exit(1);
});
