require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN مفقود من .env');
}

function extractYoutubeUrl(text) {
  if (!text) return null;
  const regex = /(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i;
  const match = text.match(regex);
  return match ? match[0] : null;
}

async function getUpdates(offset = 0, retries = 3) {
  const url = `${API_BASE}/getUpdates?offset=${offset}&timeout=10`;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) {
        throw new Error(`فشل getUpdates: ${JSON.stringify(data)}`);
      }
      return data.result;
    } catch (error) {
      lastError = error;
      console.error(`⚠️ محاولة ${attempt}/${retries} فشلت (getUpdates): ${error.message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000)); // 2s, 4s...
      }
    }
  }
  throw lastError;
}

async function getLatestYoutubeMessage(offset = 0) {
  const updates = await getUpdates(offset);
  for (const update of updates) {
    const message = update.message;
    if (!message || !message.text) continue;
    const url = extractYoutubeUrl(message.text);
    if (url) {
      return {
        updateId: update.update_id,
        chatId: message.chat.id,
        url,
      };
    }
  }
  return null;
}

async function sendMessage(chatId, text) {
  const url = `${API_BASE}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`فشل sendMessage: ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function sendErrorAlert(stepLabel, error) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.error('⚠️ TELEGRAM_CHAT_ID مفقود من .env — ما راح يوصل إشعار خطأ');
    return;
  }
  const text = `❌ فشل البوت\nالخطوة: ${stepLabel}\nالسبب: ${error.message}`;
  try {
    await sendMessage(chatId, text);
  } catch (notifyErr) {
    console.error('⚠️ فشل إرسال إشعار الخطأ نفسه:', notifyErr.message);
  }
}

module.exports = {
  extractYoutubeUrl,
  getUpdates,
  getLatestYoutubeMessage,
  sendMessage,
  sendErrorAlert,
};
