const fs = require('fs');
const { google } = require('googleapis');

// يجهز عميل OAuth2 مربوط بالريفريش توكن (يجدد الأكسس توكن تلقائياً)
function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

// يرفع الفيديو النهائي على القناة (يحدد القناة تلقائياً حسب صاحب التوكن)
async function uploadVideo({ videoPath, title, description, tags = [], thumbnailPath, privacyStatus = 'private' }) {
  if (!fs.existsSync(videoPath)) {
    throw new Error('ملف الفيديو غير موجود: ' + videoPath);
  }

  const auth = getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log('⏫ رفع الفيديو على يوتيوب...');
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description: description || '',
        tags,
        channelId: process.env.YOUTUBE_CHANNEL_ID || undefined,
      },
      status: {
        privacyStatus, // private / unlisted / public
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  console.log('✅ تم رفع الفيديو:', videoId);

  // يرفع الثمبنيل المخصص إذا موجود
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    console.log('⏫ رفع الثمبنيل...');
    await youtube.thumbnails.set({
      videoId,
      media: {
        body: fs.createReadStream(thumbnailPath),
      },
    });
    console.log('✅ تم رفع الثمبنيل');
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

module.exports = {
  getOAuthClient,
  uploadVideo,
};
