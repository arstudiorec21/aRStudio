// AR Studio Recording — Cloudflare Pages + Supabase
// GitHub = source repository. Cloudflare Pages = production hosting.
// Hanya publishable/anon key Supabase yang boleh ada di file frontend ini.
window.AR_STUDIO_CONFIG = {
  SUPABASE_URL: 'https://caitooeanelkrlkckrrk.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TthJYbek0YiEAYAKFvqsBA_1_Et6nRl',
  BASE_PATH: '/',
  CACHE_MINUTES: 5,
  HOME_AUDIO_LIMIT: 4,
  HOME_VIDEO_LIMIT: 4,
  // Opsional: Apps Script Web App untuk upload file ke Google Drive dari /admin/.
  DRIVE_UPLOAD_URL: ''
};
