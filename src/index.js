require('dotenv').config();
const telegramService = require('./services/telegram.service');
const { runPipeline } = require('./pipeline');

const POLL_INTERVAL_MS = 4000; // كل كم ثانية يفحص رسايل جديدة
let offset = 0;
let isBusy = false; // يمنع تشغيل بايبلاين ثاني بنفس الوقت

async function handleMessage(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === '/start') {
    await telegramService.sendMessage(
      chatId,
      '👋 أهلاً! دز رابط فيديو يوتيوب وراح أسويلك دبلجة ونشر تلقائي.'
    );
    return;
  }

  const url = telegramService.extractYoutubeUrl(text);
  if (!url) {
    await telegramService.sendMessage(chatId, '⚠️ دز رابط يوتيوب صحيح.');
    return;
  }

  if (isBusy) {
    await telegramService.sendMessage(chatId, '⏳ فيه شغل شغال هسه، انتظر لين يخلص.');
    return;
  }

  isBusy = true;
  try {
    await telegramService.sendMessage(chatId, '🚀 استلمت الرابط، بديت الشغل...');
    const result = await runPipeline(url);
    await telegramService.sendMessage(
      chatId,
      `✅ خلص ونزل على يوتيوب:\n${result.uploadResult.url}`
    );
  } catch (error) {
    // pipeline.js أصلاً يرسل إشعار خطأ مفصل، هنا بس نطمن المستخدم
    console.error('❌ فشل تشغيل البايبلاين:', error.message);
  } finally {
    isBusy = false;
  }
}

async function pollLoop() {
  try {
    const updates = await telegramService.getUpdates(offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      await handleMessage(update);
    }
  } catch (error) {
    console.error('❌ خطأ بحلقة الاستماع (poll):', error.message);
  } finally {
    setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

console.log('🤖 البوت شغال ويستمع لرسايل تلجرام...');
pollLoop();
