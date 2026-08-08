const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = promisify(exec);
const translateService = require('./translate.service');
const thumbnailService = require('./thumbnail.service');

// يفحص الفيديو كامل ويرجع قائمة الكروت (فترات وجود نص عربي ثابت)
async function detectTextCards(videoPath, jobDir) {
  const script = path.join(__dirname, '..', 'python', 'detect_text_cards.py');
  const framesDir = path.join(jobDir, 'text_card_frames');
  const { stdout } = await execAsync(`python3 "${script}" "${videoPath}" "${framesDir}"`, {
    maxBuffer: 1024 * 1024 * 20,
  });
  const { cards } = JSON.parse(stdout.trim());
  return cards;
}

async function getArabicText(framePath) {
  const script = path.join(__dirname, '..', 'python', 'get_arabic_text.py');
  const { stdout } = await execAsync(`python3 "${script}" "${framePath}"`, {
    maxBuffer: 1024 * 1024 * 5,
  });
  return stdout.trim();
}

// يترجم ويعدل كل كرت (يمسح العربي ويكتب الإنجليزي بمكانه)
async function buildEditedCards(cards, jobDir) {
  const results = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const arabicText = await getArabicText(card.framePath);
    if (!arabicText) continue;
    const englishText = await translateService.translateText(arabicText);
    if (!englishText) continue;
    const outputPath = path.join(jobDir, `text_card_${i}.png`);
    await thumbnailService.editThumbnail(card.framePath, englishText, outputPath);
    results.push({ start: card.start, end: card.end, editedPath: outputPath });
  }
  return results;
}

// يركب كل الكروت المعدلة فوق الفيديو النهائي، كل وحدة بتوقيتها
async function overlayTextCards(videoPath, editedCards, outputPath) {
  if (!editedCards.length) {
    fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  const inputs = ['-i', `"${videoPath}"`];
  editedCards.forEach(c => inputs.push('-i', `"${c.editedPath}"`));

  let filter = '';
  let prevLabel = '0:v';
  editedCards.forEach((c, i) => {
    const inputIndex = i + 1;
    const outLabel = i === editedCards.length - 1 ? 'vout' : `v${i}`;
    filter += `[${prevLabel}][${inputIndex}:v]overlay=0:0:enable='between(t,${c.start},${c.end})'[${outLabel}];`;
    prevLabel = outLabel;
  });
  filter = filter.slice(0, -1);

  const cmd = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filter}" -map "[vout]" -map 0:a -c:a copy "${outputPath}"`;
  await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });
  return outputPath;
}

module.exports = { detectTextCards, buildEditedCards, overlayTextCards };
