# YouTube-Bot-2
Telegram bot: send a YouTube link, get back an auto-dubbed English version published to a second channel.

## Pipeline
1. Telegram polling (GitHub Actions cron)
2. yt-dlp download
3. Groq Whisper transcription (Arabic)
4. Groq LLM translation (English)
5. Edge-TTS voice generation
6. ffmpeg audio/video merge
7. Thumbnail text swap (OCR + redraw)
8. YouTube Data API upload
