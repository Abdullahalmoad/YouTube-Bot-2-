require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

// يترجم مصفوفة segments عربية لإنجليزي دفعة وحدة (يحافظ على السياق)
async function translateSegments(segments) {
  const numbered = segments
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join('\n');

  const prompt = `ترجم الجمل التالية من العربية للإنجليزية لفيديو يوتيوب علمي قصير (Did you know / What if style).

قواعد صارمة:
- ترجمة طبيعية وسلسة، مو حرفية
- حافظ على نفس عدد الجمل بالضبط (${segments.length} جملة)
- حاول تخلي طول كل جملة إنجليزية قريب من طول نظيرتها العربية (عشان التزامن الصوتي)
- رجّع فقط بصيغة JSON array من نصوص، بدون أي شرح أو نص إضافي
- مثال الشكل المطلوب: ["Sentence one.", "Sentence two."]

الجمل:
${numbered}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const raw = completion.choices[0].message.content.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('فشل استخراج JSON من رد الترجمة: ' + raw);
  }

  const translations = JSON.parse(jsonMatch[0]);
  if (translations.length !== segments.length) {
    throw new Error(
      `عدد الترجمات (${translations.length}) لا يطابق عدد الجمل الأصلية (${segments.length})`
    );
  }

  return segments.map((s, i) => ({
    ...s,
    start: s.start,
    end: s.end,
    textAr: s.text,
    textEn: translations[i],
  }));
}

// يدقق العنوان الإنجليزي لغوياً (قواعد، إملاء، صياغة) قبل الرفع على يوتيوب
async function proofreadTitle(title) {
  const prompt = `You are a professional English copy editor for YouTube titles.

Fix any grammar, spelling, or phrasing issues in the following YouTube video title. Keep it natural, catchy, and under 100 characters. Do NOT change the meaning or add new claims. Return ONLY the corrected title, with no quotes, no explanation, and no extra text.

Title:
${title}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  let fixed = completion.choices[0].message.content.trim();
  fixed = fixed.replace(/^["']|["']$/g, ''); // يشيل علامات اقتباس إذا زادها الموديل
  return fixed.slice(0, 100);
}

module.exports = {
  translateSegments,
  proofreadTitle,
};
