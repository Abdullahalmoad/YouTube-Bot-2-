require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';
const BATCH_SIZE = 25; // نقسم الجمل لدفعات عشان نتجنب تجاوز حد الموديل بالفيديوهات الطويلة

// يترجم دفعة وحدة من الجمل (مقسّمة مسبقاً)
async function translateBatch(segments, batchIndex, totalBatches) {
  const numbered = segments
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join('\n');

  const prompt = `ترجم الجمل التالية من العربية للإنجليزية لفيديو يوتيوب علمي قصير (Did you know / What if style).
هذي دفعة ${batchIndex + 1} من ${totalBatches} من نفس الفيديو، ترجمها بشكل مستقل ومتناسق مع الأسلوب.

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
    throw new Error(`فشل استخراج JSON من رد الترجمة (دفعة ${batchIndex + 1}): ` + raw);
  }

  const translations = JSON.parse(jsonMatch[0]);
  if (translations.length !== segments.length) {
    throw new Error(
      `عدد الترجمات (${translations.length}) لا يطابق عدد الجمل بالدفعة ${batchIndex + 1} (${segments.length})`
    );
  }

  return translations;
}

// يترجم مصفوفة segments عربية لإنجليزي، مقسّمة لدفعات صغيرة لتفادي حدود الموديل بالفيديوهات الطويلة
async function translateSegments(segments) {
  const batches = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  const allTranslations = [];
  for (let b = 0; b < batches.length; b++) {
    const translations = await translateBatch(batches[b], b, batches.length);
    allTranslations.push(...translations);
  }

  if (allTranslations.length !== segments.length) {
    throw new Error(
      `عدد الترجمات الكلي (${allTranslations.length}) لا يطابق عدد الجمل الأصلية (${segments.length})`
    );
  }

  return segments.map((s, i) => ({
    ...s,
    start: s.start,
    end: s.end,
    textAr: s.text,
    textEn: allTranslations[i],
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
