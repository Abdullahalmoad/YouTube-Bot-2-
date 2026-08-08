require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';
const BATCH_SIZE = 12;

async function translateBatch(segments, batchIndex, totalBatches, retries = 2) {
  const numbered = segments
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join('\n');

  const prompt = `ترجم الجمل التالية من العربية للإنجليزية لفيديو يوتيوب علمي قصير (Did you know / What if style).
هذي دفعة ${batchIndex + 1} من ${totalBatches} من نفس الفيديو، ترجمها بشكل مستقل ومتناسق مع الأسلوب.

قواعد صارمة (لازم تتبعها بالضبط):
- عدد عناصر مصفوفة JSON اللي ترجعها لازم يكون بالضبط ${segments.length}، مثل عدد الجمل بالمدخل
- لا تدمج جملتين بجملة وحدة، ولا تقسم جملة وحدة لجملتين — كل جملة مدخل = عنصر وحيد بالمخرج بنفس الترتيب
- ترجمة طبيعية وسلسة، مو حرفية
- حاول تخلي طول كل جملة إنجليزية قريب من طول نظيرتها العربية (عشان التزامن الصوتي)
- رجّع فقط بصيغة JSON array من نصوص، بدون أي شرح أو نص إضافي
- مثال الشكل المطلوب: ["Sentence one.", "Sentence two."]

الجمل (${segments.length} جملة بالضبط):
${numbered}`;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: attempt === 1 ? 0.3 : 0.1,
    });

    const raw = completion.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`⚠️ فشل استخراج JSON من رد الترجمة (دفعة ${batchIndex + 1}, محاولة ${attempt}), بعيد المحاولة...`);
      continue;
    }

    let translations;
    try {
      translations = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn(`⚠️ JSON غير صالح بالترجمة (دفعة ${batchIndex + 1}, محاولة ${attempt}), بعيد المحاولة...`);
      continue;
    }

    if (translations.length === segments.length) {
      return translations;
    }

    console.warn(
      `⚠️ عدد الترجمات (${translations.length}) لا يطابق عدد الجمل (${segments.length}) بالدفعة ${batchIndex + 1}, محاولة ${attempt}/${retries + 1}`
    );
  }

  console.warn(`↩️ رجعنا لترجمة الدفعة ${batchIndex + 1} جملة جملة (fallback) بعد فشل كل المحاولات`);
  return translateSentenceBySentence(segments);
}

async function translateSentenceBySentence(segments) {
  const results = [];
  for (const s of segments) {
    const prompt = `Translate the following Arabic sentence to natural, fluent English for a short science YouTube video. Return ONLY the translated sentence, with no quotes, no explanation, no extra text.

Arabic sentence:
${s.text}`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    let text = completion.choices[0].message.content.trim();
    text = text.replace(/^["']|["']$/g, '');
    results.push(text);
  }
  return results;
}

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
  fixed = fixed.replace(/^["']|["']$/g, '');
  return fixed.slice(0, 100);
}

module.exports = {
  translateSegments,
  proofreadTitle,
};
