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
    start: s.start,
    end: s.end,
    textAr: s.text,
    textEn: translations[i],
  }));
}

module.exports = {
  translateSegments,
};
