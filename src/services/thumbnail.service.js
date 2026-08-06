const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);

async function editThumbnail(imagePath, englishText, outputPath) {
  const script = path.join(__dirname, '..', 'python', 'thumbnail_edit.py');
  const escaped = englishText.replace(/"/g, '\\"');
  const { stdout } = await execAsync(
    `python3 "${script}" "${imagePath}" "${escaped}" "${outputPath}"`,
    { maxBuffer: 1024 * 1024 * 10 }
  );
  return JSON.parse(stdout.trim());
}

module.exports = { editThumbnail };
