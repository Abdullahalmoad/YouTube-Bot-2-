require('dotenv').config();
const readline = require('readline');
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n1) افتح هذا الرابط بالمتصفح وسجل دخول بحساب القناة الثانية:\n');
console.log(authUrl);
console.log('\n2) بعد الموافقة، Google بيعطيك كود. الصقه هنا:\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('الكود: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n✅ نجح! هذا الـ refresh token:\n');
    console.log(tokens.refresh_token);
    console.log('\nضيفه بملف .env هيچي:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    console.error('\n❌ فشل الحصول على التوكن:', err.message);
  } finally {
    rl.close();
  }
});

