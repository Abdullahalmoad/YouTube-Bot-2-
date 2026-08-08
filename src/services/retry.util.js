// أداة مشتركة تعيد محاولة أي نداء API عند أخطاء مؤقتة (502/503/504/انقطاع اتصال)
// تُستخدم لتغليف نداءات Groq (ترجمة، تفريغ صوت، كابشن) عشان انقطاع مؤقت بسيرفر Groq/Cloudflare
// ما يوقف البايبلاين كامل.

function isTransientError(error) {
  const status = error?.status || error?.response?.status;
  const message = String(error?.message || '');
  return (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 429 ||
    /Bad Gateway|Service Unavailable|Gateway Timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message)
  );
}

async function withRetry(fn, { retries = 3, label = 'عملية' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const transient = isTransientError(error);
      if (!transient || attempt > retries) {
        throw error;
      }
      const waitMs = attempt * 3000;
      console.warn(
        `⚠️ ${label} فشلت بخطأ مؤقت (محاولة ${attempt}/${retries + 1}): ${error.message} — إعادة محاولة بعد ${waitMs / 1000}s`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

module.exports = { withRetry, isTransientError };
