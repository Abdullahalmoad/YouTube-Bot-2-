require('dotenv').config();
const fetch = require('node-fetch');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN مفقود من .env');
}

// يطلع رابط يوتيوب من نص لو موجود
function extractYoutubeUrl(text) {
  if (!text) return null;
  const regex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i;
  const match = text.match(regex);
  return match ? match[0] : null;
}

// يجيب آخر التحديثات (رسايل) من البوت
async function getUpdates(offset = 0) {
  const url = `${API_BASE}/getUpdates?offset=${offset}&timeout=10`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`فشل getUpdates: ${JSON.stringify(data)}`);
  }
  return data.result;
}

// يدور على أحدث رسالة فيها رابط يوتيوب صالح
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

// يرسل رسالة رد للمستخدم
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

module.exports = {
  extractYoutubeUrl,
  getUpdates,
  getLatestYoutubeMessage,
  sendMessage,
};
