(function(){
'use strict';

var PAGE = (document.body.getAttribute('data-page') || 'home').toLowerCase();
var CFG = window.AR_STUDIO_CONFIG || {};
var SUPABASE_URL = String(CFG.SUPABASE_URL || '').trim();
var SUPABASE_KEY = String(CFG.SUPABASE_PUBLISHABLE_KEY || '').trim();
var SB = null;
var BASE_PATH = String(CFG.BASE_PATH || '/ar-studio-recording/');
var CACHE_MINUTES = Math.max(1, Number(CFG.CACHE_MINUTES || 10));
var HOME_AUDIO_LIMIT = Math.max(1, Number(CFG.HOME_AUDIO_LIMIT || 3));
var HOME_VIDEO_LIMIT = Math.max(1, Number(CFG.HOME_VIDEO_LIMIT || 3));
var DATA = {}, playing = null, priceLookup = {}, selectedService = '';

var DEFAULT_PRICES = [
  {id:'overdub-recording',service:'Overdub Recording',price:'Rp150.000',unit:'/ jam',features:'Rp360.000 / 1/2 shift (3 jam)|Rp600.000 / shift (5 jam)',description:'Layanan overdub recording untuk vocal maupun instrumen dengan pilihan durasi per jam, setengah shift, atau full shift.',details:'Rp150.000 / jam|Rp360.000 / 1/2 shift (3 jam)|Rp600.000 / shift (5 jam)',notes:'Booking melalui WhatsApp: 0857-2209-6345'},
  {id:'aransemen-midi-instrumen',service:'Aransemen MIDI / Instrumen',price:'Rp850.000',unit:'mulai',features:'No Mixing|Mixing & Mastering Basic|Take Vocal / Edit Vocal',description:'Paket aransemen MIDI/instrumen dari produksi dasar sampai paket lengkap dengan take dan editing vocal.',details:'Rp850.000 — Aransemen, tanpa mixing|Rp1.200.000 — Aransemen + Mixing & Mastering Basic|Rp1.600.000 — Aransemen + Take Vocal/Edit Vocal + Mixing & Mastering Basic',notes:'Detail kebutuhan aransemen dan referensi musik dapat dibahas saat booking.'},
  {id:'jingle',service:'Jingle',price:'Rp3.500.000',unit:'mulai',features:'Aransemen musik|Pembuatan nada & lirik',description:'Produksi jingle untuk brand, sekolah, bisnis, campaign, atau kebutuhan promosi.',details:'Rp3.500.000 — Aransemen musik|Rp5.500.000 — Membuat nada & lirik',notes:'Brief, durasi, penggunaan komersial, dan referensi gaya musik dibahas sebelum produksi.'},
  {id:'paket-video-cover',service:'Paket Video Cover',price:'Rp800.000',unit:'/ paket',features:'Take vocal|3 angle video indoor|Editing video|Mixing & mastering',description:'Paket produksi video cover indoor dengan proses take vocal, multi-angle video, editing, mixing, dan mastering.',details:'Musik / backing track disiapkan sendiri|Take vocal setengah shift (3 jam)|3 angle video indoor|Editing video|Mixing + mastering',notes:'Musik disiapkan sendiri oleh client.'},
  {id:'mixing',service:'Mixing',price:'Rp350.000',unit:'mulai',features:'Vocal editing|Vocal tuning basic|Timing correction|EQ|Compression|Reverb & Delay|Stereo imaging|Automation|Balancing|Mix bus processing|WAV + MP3|2x revisi',description:'Mixing multitrack lengkap dengan editing dasar, balancing, processing, automation, dan final mix.',details:'Rp350.000 — 1–10 track|Rp500.000 — 11–20 track|Rp700.000 — 21–50 track|Rp1.000.000 — lebih dari 50 track|Vocal editing|Vocal tuning basic|Timing correction|EQ|Compression|Reverb & Delay|Stereo imaging|Automation|Vocal & instrumental balancing|Mix bus processing|Final mix WAV + MP3|2x revisi',notes:'Harga mengikuti jumlah track pada project.'},
  {id:'mastering',service:'Mastering',price:'Rp300.000–500.000',unit:'/ lagu',features:'EQ tonal balancing|Compression|Limiting|Stereo enhancement|Loudness optimization|Dynamic control|Streaming optimization|WAV Master|MP3 Master',description:'Finalisasi audio agar tonal balance, dinamika, loudness, dan format akhir siap untuk distribusi.',details:'EQ tonal balancing|Compression|Limiting|Stereo enhancement|Loudness optimization|Dynamic control|Streaming optimization|WAV Master|MP3 Master',notes:'Harga Rp300.000–Rp500.000 per lagu, menyesuaikan kebutuhan materi.'}
];

var icons = {mic:'🎙',sliders:'🎚',wave:'〽',pen:'✎',video:'▣'};

function one(s){ return document.querySelector(s); }
function all(s){ return document.querySelectorAll(s); }
function esc(v){
  return String(v == null ? '' : v).replace(/[&<>'"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
  });
}
function safeUrl(v){
  var s = String(v || '');
  return /^(https?:\/\/)/i.test(s) ? esc(s) : '';
}
function siteUrl(path){
  var base = window.location.origin + BASE_PATH;
  return base + String(path || '').replace(/^\//, '');
}
function accentLast(text){
  var w = esc(text).split(' ');
  if (w.length) w[w.length - 1] = '<span>' + w[w.length - 1] + '</span>';
  return w.join(' ');
}
function setText(sel, v){
  var e = one(sel);
  if (e) e.textContent = v || '';
}
function cacheKey(){ return 'arStudioData:v6:' + PAGE; }
function readCache(){
  try {
    var x = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (!x || !x.ts || !x.data) return null;
    return x;
  } catch(e){ return null; }
}
function writeCache(data){
  try { localStorage.setItem(cacheKey(), JSON.stringify({ ts: Date.now(), data: data })); } catch(e){}
}
function cacheFresh(c){ return c && (Date.now() - c.ts) < CACHE_MINUTES * 60000; }

function supabaseClient(){
  if (SB) return SB;
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.indexOf('PROJECT_REF') > -1 || SUPABASE_KEY.indexOf('GANTI_') > -1) {
    throw new Error('Supabase belum dikonfigurasi di config.js');
  }
  if (!window.supabase || !window.supabase.createClient) throw new Error('Library Supabase gagal dimuat.');
  SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return SB;
}

function normalizeRow(table, row){
  var x = Object.assign({}, row || {});
  if (table === 'services') {
    return {id:x.id,title:x.title,description:x.description,icon:x.icon,sortOrder:x.sort_order,active:x.active};
  }
  if (table === 'audio_portfolio') {
    return {id:x.id,title:x.title,artist:x.artist,coverUrl:x.cover_url,audioUrl:x.audio_url,duration:x.duration,role:x.role,year:x.year,genre:x.genre,sortOrder:x.sort_order,active:x.active};
  }
  if (table === 'video_portfolio') {
    return {id:x.id,title:x.title,subtitle:x.subtitle,youtubeId:x.youtube_id,thumbnailUrl:x.thumbnail_url,sortOrder:x.sort_order,active:x.active};
  }
  if (table === 'price_list') {
    return {id:x.id,service:x.service,price:x.price,unit:x.unit,features:x.features,sortOrder:x.sort_order,active:x.active,description:x.description,details:x.details,notes:x.notes};
  }
  if (table === 'gallery') {
    return {id:x.id,title:x.title,imageUrl:x.image_url,sortOrder:x.sort_order,active:x.active,category:x.category};
  }
  if (table === 'testimonials') {
    return {id:x.id,client:x.client,project:x.project,quote:x.quote,photoUrl:x.photo_url,sortOrder:x.sort_order,active:x.active};
  }
  if (table === 'case_studies') {
    return {id:x.id,title:x.title,project:x.project,genre:x.genre,work:x.work,beforeUrl:x.before_url,afterUrl:x.after_url,description:x.description,sortOrder:x.sort_order,active:x.active};
  }
  return x;
}

function loadTable(table, limit){
  var q = supabaseClient().from(table).select('*').eq('active', true).order('sort_order', { ascending:true });
  if (limit) q = q.limit(limit);
  return q.then(function(res){
    if (res.error) throw res.error;
    return (res.data || []).map(function(r){ return normalizeRow(table, r); });
  });
}

function loadSettings(){
  return supabaseClient().from('settings').select('key,value').then(function(res){
    if (res.error) throw res.error;
    return (res.data || []).reduce(function(out, row){ if (row.key) out[row.key] = row.value; return out; }, {});
  });
}

function loadWebsiteData(){
  var jobs = [loadSettings()];
  if (PAGE === 'home') {
    jobs.push(loadTable('services', 5), loadTable('audio_portfolio', HOME_AUDIO_LIMIT), loadTable('video_portfolio', HOME_VIDEO_LIMIT), loadTable('price_list', 5), loadTable('gallery', 6), loadTable('case_studies', 2), loadTable('testimonials', 3));
    return Promise.all(jobs).then(function(r){ return {settings:r[0],services:r[1],audio:r[2],videos:r[3],prices:r[4],gallery:r[5],caseStudies:r[6],testimonials:r[7]}; });
  }
  if (PAGE === 'portfolio') {
    jobs.push(loadTable('audio_portfolio'), loadTable('video_portfolio'));
    return Promise.all(jobs).then(function(r){ return {settings:r[0],audio:r[1],videos:r[2]}; });
  }
  if (PAGE === 'prices') {
    jobs.push(loadTable('price_list'));
    return Promise.all(jobs).then(function(r){ return {settings:r[0],prices:r[1]}; });
  }
  if (PAGE === 'services') {
    jobs.push(loadTable('services'));
    return Promise.all(jobs).then(function(r){ return {settings:r[0],services:r[1]}; });
  }
  if (PAGE === 'gallery') {
    jobs.push(loadTable('gallery'));
    return Promise.all(jobs).then(function(r){ return {settings:r[0],gallery:r[1]}; });
  }
  return Promise.all(jobs).then(function(r){ return {settings:r[0]}; });
}

function googleDriveFileId(url){
  var s = String(url || '').trim();
  var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return '';
}
function googleDrivePreviewUrl(url){
  var id = googleDriveFileId(url);
  return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
}
function trackInitials(text){
  var parts = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '♪';
  return ((parts[0][0] || '') + (parts.length > 1 ? (parts[1][0] || '') : '')).toUpperCase().slice(0, 2);
}
function coverMarkup(x){
  var src = safeUrl(x.coverUrl);
  if (src) {
    return '<img class="audio-cover" src="' + src + '" alt="' + esc(x.title) + '" loading="lazy">';
  }
  return '<div class="audio-cover audio-cover-placeholder" aria-hidden="true"><span>' + esc(trackInitials(x.title)) + '</span></div>';
}
function ensureDriveAudioModal(){
  if (one('#driveAudioModal')) return;
  var modal = document.createElement('div');
  modal.id = 'driveAudioModal';
  modal.className = 'modal drive-audio-modal';
  modal.innerHTML = '' +
    '<div class="drive-audio-modal-card">' +
      '<button class="modal-close drive-audio-close" id="driveAudioModalClose" aria-label="Tutup">×</button>' +
      '<div class="drive-audio-modal-head">' +
        '<div>' +
          '<div class="drive-audio-label">Google Drive Preview</div>' +
          '<h3 id="driveAudioModalTitle">Audio Preview</h3>' +
        '</div>' +
        '<a id="driveAudioModalOpenLink" class="drive-audio-open-link" href="#" target="_blank" rel="noopener">Buka di Google Drive ↗</a>' +
      '</div>' +
      '<div class="drive-audio-modal-body">' +
        '<iframe id="driveAudioFrame" title="Google Drive audio player" src="" loading="lazy" allow="autoplay" frameborder="0"></iframe>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  var closeBtn = one('#driveAudioModalClose');
  if (closeBtn) closeBtn.onclick = closeDriveAudioModal;
  modal.onclick = function(e){ if (e.target === modal) closeDriveAudioModal(); };
}
function openDriveAudioModal(src, title){
  ensureDriveAudioModal();
  var modal = one('#driveAudioModal');
  var frame = one('#driveAudioFrame');
  var ttl = one('#driveAudioModalTitle');
  var link = one('#driveAudioModalOpenLink');
  if (ttl) ttl.textContent = title || 'Audio Preview';
  if (frame) frame.src = src || '';
  if (link) link.href = String(src || '').replace(/\/preview(?:\?.*)?$/, '/view');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}
function closeDriveAudioModal(){
  var modal = one('#driveAudioModal');
  var frame = one('#driveAudioFrame');
  if (frame) frame.src = '';
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function audioCard(x){
  var raw = String(x.audioUrl || '');
  var drive = googleDrivePreviewUrl(raw);
  var play = drive
    ? '<button class="play-audio play-drive-audio" data-drive-src="' + esc(drive) + '" data-title="' + esc(x.title) + '" aria-label="Buka player Google Drive untuk ' + esc(x.title) + '">▶</button>'
    : '<button class="play-audio" data-src="' + safeUrl(raw) + '" aria-label="Putar ' + esc(x.title) + '">▶</button>';
  var sourceBadge = drive ? '<span class="audio-source-badge">Google Drive</span>' : '';

  return '' +
    '<article class="audio-card' + (drive ? ' drive-audio' : '') + '">' +
      coverMarkup(x) +
      play +
      '<div class="audio-info">' +
        '<div class="audio-title-row"><h4>' + esc(x.title) + '</h4>' + sourceBadge + '</div>' +
        '<p>Artist : ' + esc(x.artist) + '</p>' +
        '<div class="waveform"></div>' +
      '</div>' +
      '<span class="audio-duration">' + esc(x.duration) + '</span>' +
    '</article>';
}

function videoCard(x){
  var th = x.thumbnailUrl || ('https://img.youtube.com/vi/' + encodeURIComponent(x.youtubeId) + '/hqdefault.jpg');
  return '<article class="video-card" data-video="' + esc(x.youtubeId) + '"><div class="video-thumb"><img src="' + safeUrl(th) + '" alt="' + esc(x.title) + '" loading="lazy"><span class="video-play">▶</span></div><h4>' + esc(x.title) + '</h4><p>' + esc(x.subtitle) + '</p></article>';
}
function priceCard(x){
  var k = String(x.id || x.service);
  priceLookup[k] = x;
  return '<article class="price-card"><h3>' + esc(x.service) + '</h3><div class="starting">Mulai dari</div><div class="amount">' + esc(x.price) + ' <small>' + esc(x.unit) + '</small></div><ul class="features">' + String(x.features || '').split('|').filter(Boolean).map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul><div class="price-actions"><button class="price-action detail-price-btn" type="button" data-price-id="' + esc(k) + '">Lihat Detail</button><button class="price-action booking-price-btn" type="button" data-service="' + esc(x.service) + '">Booking</button></div></article>';
}
function galleryCategory(x){ var c = String(x.category || 'Studio').trim(); return c || 'Studio'; }
function galleryCard(x){
  var c = galleryCategory(x);
  return '<figure class="detail-gallery-card" data-category="' + esc(c) + '"><img src="' + safeUrl(x.imageUrl) + '" alt="' + esc(x.title) + '" loading="lazy"><figcaption>' + esc(x.title) + '<small>' + esc(c) + '</small></figcaption></figure>';
}

function renderCommon(){
  var s = DATA.settings || {};
  setText('#footerText', s.footerText || '');
  document.title = document.title || s.studioName || 'AR Studio Recording';
}
function renderHome(){
  var s = DATA.settings || {};
  var services = DATA.services || [];
  var audio = DATA.audio || [];
  var videos = DATA.videos || [];
  var prices = (DATA.prices && DATA.prices.length) ? DATA.prices : DEFAULT_PRICES;
  var gallery = DATA.gallery || [];
  var caseStudies = DATA.caseStudies || [];
  var testimonials = DATA.testimonials || [];

  setText('#eyebrow', s.eyebrow);
  var h = one('#heroTitle');
  if (h) h.innerHTML = accentLast(s.heroTitle || 'TURN YOUR SOUND INTO SOMETHING GREAT.');
  setText('#heroSubtitle', s.heroSubtitle);
  var hero = one('.hero');
  if (hero && s.heroImage) hero.style.backgroundImage = "url('" + safeUrl(s.heroImage) + "')";
  setText('#studioName', s.studioName);
  setText('#address', s.address);
  setText('#hours', s.hours);
  setText('#phone', s.phone);
  setText('#aboutText', s.about);

  var sl = one('#serviceList');
  if (sl) sl.innerHTML = services.map(function(x){
    return '<a class="service-item" href="' + siteUrl('services/') + '"><div class="service-icon">' + (icons[x.icon] || '◆') + '</div><div><h3>' + esc(x.title) + '</h3><p>' + esc(x.description) + '</p></div></a>';
  }).join('');

  var al = one('#audioList');
  if (al) al.innerHTML = audio.map(audioCard).join('');

  var vl = one('#videoList');
  if (vl) vl.innerHTML = videos.map(videoCard).join('');

  var pl = one('#priceList');
  if (pl) pl.innerHTML = prices.map(priceCard).join('');

  var gl = one('#galleryList');
  if (gl) gl.innerHTML = gallery.map(function(x){
    return '<figure class="gallery-card"><img src="' + safeUrl(x.imageUrl) + '" alt="' + esc(x.title) + '" loading="lazy"><span>' + esc(x.title) + '</span></figure>';
  }).join('');

  var ss = one('#serviceSelect');
  if (ss) ss.innerHTML = '<option value="">Pilih layanan</option>' + services.map(function(x){ return '<option>' + esc(x.title) + '</option>'; }).join('');

  var mb = one('#mapBox');
  if (mb && s.mapEmbedUrl) mb.innerHTML = '<iframe title="Lokasi AR Studio" src="' + safeUrl(s.mapEmbedUrl) + '" loading="lazy"></iframe>';

  function engineerImageUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    var m = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
    if (m) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=w2000';
    var id = url.match(/[?&]id=([^&#]+)/i);
    if (/drive\.google\.com\/thumbnail/i.test(url) && id) {
      return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id[1]) + '&sz=w2000';
    }
    return url;
  }

  var portrait = one('#engineerPortrait');
  if (portrait && s.engineerImage) {
    portrait.style.backgroundImage = "url('" + safeUrl(engineerImageUrl(s.engineerImage)) + "')";
    portrait.style.backgroundSize = 'cover';
    portrait.style.backgroundPosition = s.engineerImagePosition || 'center 22%';
    portrait.classList.add('has-photo');
  }
  setText('#engineerName', s.engineerName || 'Afif Ramdhan');
  setText('#engineerRole', s.engineerRole || 'Recording & Mixing Engineer · Music Producer');
  setText('#engineerBio', s.engineerBio || 'Saya membantu musisi mengubah ide dan rekaman mentah menjadi produksi musik yang siap dirilis — dari recording, editing, mixing, mastering, hingga arrangement.');
  setText('#proof1Title', s.proof1Title || '3rd Place');
  setText('#proof1Text', s.proof1Text || 'National Mixing Competition');
  setText('#proof2Title', s.proof2Title || 'AR Studio');
  setText('#proof2Text', s.proof2Text || 'Recording & Production');
  setText('#proof3Title', s.proof3Title || 'Music Educator');
  setText('#proof3Text', s.proof3Text || 'Guitar & Production');

  var cs = one('#caseStudyList');
  if (cs && !caseStudies.length) { cs.closest('.case-section').style.display = 'none'; }
  if (cs && caseStudies.length) cs.innerHTML = caseStudies.map(function(x){
    var before = safeUrl(x.beforeUrl), after = safeUrl(x.afterUrl);
    return '<article class="case-card"><div class="case-meta">' +
      (x.genre?'<span>'+esc(x.genre)+'</span>':'') + (x.work?'<span>'+esc(x.work)+'</span>':'') +
      '</div><h3>'+esc(x.title)+'</h3><p>'+esc(x.description||x.project||'')+'</p><div class="ab-player">' +
      (before?'<a href="'+before+'" target="_blank" rel="noopener"><strong>▶</strong><div>RAW<small>Before processing</small></div></a>':'') +
      (after?'<a href="'+after+'" target="_blank" rel="noopener"><strong>▶</strong><div>FINAL<small>Mixed / mastered</small></div></a>':'') +
      '</div></article>';
  }).join('');

  var tl = one('#testimonialList');
  if (tl && !testimonials.length) { tl.closest('.testimonial-section').style.display = 'none'; }
  if (tl && testimonials.length) tl.innerHTML = testimonials.map(function(x){
    return '<article class="testimonial-card"><div class="quote">'+esc(x.quote)+'</div><div class="testimonial-person"><b>'+esc(x.client)+'</b><span>'+esc(x.project||'AR Studio Client')+'</span></div></article>';
  }).join('');

  var so = one('#socials');
  if (so) {
    so.innerHTML = [['IG', s.instagram], ['YT', s.youtube], ['WA', 'https://wa.me/' + (s.whatsapp || '')], ['SC', s.soundcloud]]
      .filter(function(x){ return x[1]; })
      .map(function(x){ return '<a href="' + safeUrl(x[1]) + '" target="_blank" rel="noopener">' + x[0] + '</a>'; })
      .join('');
  }
}
function renderPortfolio(){
  var a = DATA.audio || [];
  var v = DATA.videos || [];
  one('#portfolioAudioList').innerHTML = a.length ? a.map(audioCard).join('') : '<div class="empty-state">Belum ada audio portfolio.</div>';
  one('#portfolioVideoList').innerHTML = v.length ? v.map(videoCard).join('') : '<div class="empty-state">Belum ada video portfolio.</div>';
}
function renderPrices(){
  var p = (DATA.prices && DATA.prices.length) ? DATA.prices : DEFAULT_PRICES;
  one('#allPriceList').innerHTML = p.length ? p.map(priceCard).join('') : '<div class="empty-state">Belum ada price list.</div>';
}
function renderServices(){
  var s = DATA.services || [];
  one('#allServicesList').innerHTML = s.length ? s.map(function(x){
    return '<article class="service-page-card"><div class="service-page-icon">' + (icons[x.icon] || '◆') + '</div><div><h3>' + esc(x.title) + '</h3><p>' + esc(x.description) + '</p><button class="service-page-booking" type="button" data-service="' + esc(x.title) + '">Booking Studio</button></div></article>';
  }).join('') : '<div class="empty-state">Belum ada layanan.</div>';
}
function renderGallery(){
  var g = DATA.gallery || [];
  var cats = [];
  g.forEach(function(x){ var c = galleryCategory(x); if (cats.indexOf(c) < 0) cats.push(c); });
  one('#galleryFilters').innerHTML = ['Semua'].concat(cats).map(function(c, i){
    return '<button type="button" class="' + (i === 0 ? 'active' : '') + '" data-gallery-filter="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('');
  one('#allGalleryList').innerHTML = g.length ? g.map(galleryCard).join('') : '<div class="empty-state">Belum ada foto gallery.</div>';
}
function renderAbout(){
  var s = DATA.settings || {};
  setText('#aboutFullDetail', s.aboutDetail || s.about || '');
  setText('#aboutVisionText', s.aboutVision || '-');
  setText('#aboutMissionText', s.aboutMission || '-');
}
function render(){
  renderCommon();
  if (PAGE === 'home') renderHome();
  else if (PAGE === 'portfolio') renderPortfolio();
  else if (PAGE === 'prices') renderPrices();
  else if (PAGE === 'services') renderServices();
  else if (PAGE === 'gallery') renderGallery();
  else if (PAGE === 'about') renderAbout();
  bindDynamic();
}

function detailItems(v){
  return String(v || '').split(/\r?\n|\|/).map(function(x){ return x.trim(); }).filter(Boolean);
}
function openServiceDetail(k){
  var i = priceLookup[String(k)];
  if (!i) return;
  selectedService = i.service || '';
  setText('#serviceModalTitle', i.service || 'Detail Layanan');
  setText('#serviceModalPrice', i.price);
  setText('#serviceModalUnit', i.unit);
  setText('#serviceModalDescription', i.description || 'Deskripsi lengkap layanan akan segera tersedia.');
  var d = one('#serviceModalDetails');
  if (d) d.innerHTML = detailItems(i.details || i.features).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('');
  setText('#serviceModalNotes', i.notes);
  var nb = one('#serviceNotesBlock');
  if (nb) nb.style.display = i.notes ? 'block' : 'none';
  var m = one('#serviceModal');
  if (m) m.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeServiceDetail(){
  var m = one('#serviceModal');
  if (m) m.classList.remove('open');
  document.body.style.overflow = '';
}
function goToBooking(service){
  try { sessionStorage.setItem('arBookingService', service || ''); } catch(e){}
  window.location.href = siteUrl('index.html#booking');
}

function bindDynamic(){
  all('.play-audio').forEach(function(b){
    b.onclick = function(){
      var driveSrc = b.getAttribute('data-drive-src');
      if (driveSrc) {
        if (playing) { playing.pause(); playing = null; }
        openDriveAudioModal(driveSrc, b.getAttribute('data-title') || 'Audio Preview');
        return;
      }
      var src = b.getAttribute('data-src');
      if (!src) return;
      if (playing) playing.pause();
      playing = new Audio(src);
      playing.play().catch(function(err){ console.error('Audio gagal diputar:', err); });
    };
  });

  all('.video-card').forEach(function(c){
    c.onclick = function(){
      var f = one('#videoFrame');
      var m = one('#videoModal');
      if (f && m) {
        f.src = 'https://www.youtube.com/embed/' + encodeURIComponent(c.getAttribute('data-video')) + '?autoplay=1';
        m.classList.add('open');
      }
    };
  });

  all('.detail-price-btn').forEach(function(b){
    b.onclick = function(){ openServiceDetail(b.getAttribute('data-price-id')); };
  });
  all('.booking-price-btn,.service-page-booking').forEach(function(b){
    b.onclick = function(){ goToBooking(b.getAttribute('data-service')); };
  });
  all('[data-gallery-filter]').forEach(function(b){
    b.onclick = function(){
      var ch = b.getAttribute('data-gallery-filter');
      all('[data-gallery-filter]').forEach(function(x){ x.classList.toggle('active', x === b); });
      all('.detail-gallery-card').forEach(function(c){
        c.style.display = (ch === 'Semua' || c.getAttribute('data-category') === ch) ? 'block' : 'none';
      });
    };
  });
}

function bindStatic(){
  var mb = one('#menuBtn');
  if (mb) mb.onclick = function(){ one('#navLinks').classList.toggle('open'); };

  all('#navLinks a').forEach(function(a){
    a.onclick = function(){ one('#navLinks').classList.remove('open'); };
  });

  var mc = one('#modalClose');
  if (mc) mc.onclick = function(){
    one('#videoModal').classList.remove('open');
    one('#videoFrame').src = '';
  };

  var smc = one('#serviceModalClose');
  if (smc) smc.onclick = closeServiceDetail;

  var smb = one('#serviceModalBooking');
  if (smb) smb.onclick = function(){
    closeServiceDetail();
    goToBooking(selectedService);
  };

  var sm = one('#serviceModal');
  if (sm) sm.onclick = function(e){ if (e.target === sm) closeServiceDetail(); };

  ensureDriveAudioModal();

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      closeServiceDetail();
      closeDriveAudioModal();
      var vm = one('#videoModal');
      if (vm) vm.classList.remove('open');
    }
  });

  if (PAGE === 'home') {
    var f = one('#bookingForm');
    if (f) f.onsubmit = sendBooking;
    var d = new Date();
    d.setDate(d.getDate() + 1);
    var di = one('[name=date]');
    if (di) di.min = d.toISOString().split('T')[0];
  }
}

function sendBooking(e){
  e.preventDefault();
  var f = e.currentTarget;
  var b = one('#submitBtn');
  var s = one('#formStatus');
  var p = {
    name:String(f.elements.name.value || '').trim(),
    whatsapp:String(f.elements.whatsapp.value || '').trim(),
    service:String(f.elements.service.value || '').trim(),
    booking_date:f.elements.date.value,
    booking_time:String(f.elements.time.value || '').trim(),
    notes:String(f.elements.notes.value || '').trim(),
    source:window.location.href,
    status:'Baru'
  };
  if (!p.name || !p.whatsapp || !p.service || !p.booking_date || !p.booking_time) {
    s.className = 'form-status error';
    s.textContent = 'Mohon lengkapi data booking.';
    return;
  }
  b.disabled = true;
  b.textContent = 'Mengirim...';
  var bookingId = 'ARS-' + new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14) + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  p.booking_id = bookingId;

  Promise.resolve().then(function(){ return supabaseClient().from('bookings').insert(p); }).then(function(res){
    if (res.error) throw res.error;
    s.className = 'form-status ok';
    s.textContent = '✓ Booking berhasil dikirim. ID: ' + bookingId;
    f.reset();
  }).catch(function(err){
    console.error(err);
    s.className = 'form-status error';
    s.textContent = 'Booking gagal dikirim. Silakan coba lagi atau hubungi WhatsApp AR Studio.';
  }).finally(function(){
    b.disabled = false;
    b.textContent = 'Kirim Booking';
  });
}

function finish(){
  var l = one('#loader');
  if (l) l.classList.add('hidden');
  if (PAGE === 'home') {
    try {
      var ch = sessionStorage.getItem('arBookingService');
      if (ch) {
        var ss = one('#serviceSelect');
        if (ss) {
          var exists = Array.prototype.some.call(ss.options, function(o){ return o.value === ch || o.text === ch; });
          if (!exists) {
            var opt = document.createElement('option');
            opt.value = ch;
            opt.textContent = ch;
            ss.appendChild(opt);
          }
          ss.value = ch;
        }
        sessionStorage.removeItem('arBookingService');
      }
    } catch(e){}
  }
}

bindStatic();
var cached = readCache();
if (cached) {
  // Tampilkan cache seketika agar navigasi terasa cepat.
  DATA = cached.data || {};
  render();
  finish();
}

// Selalu cek Supabase di background, meskipun cache masih fresh.
// Ini membuat perubahan dari Supabase muncul segera tanpa menunggu TTL cache.
loadWebsiteData().then(function(d){
  DATA = d || {};
  writeCache(DATA);
  render();
  var st = one('#dataStatus');
  if (st) st.textContent = '';
  finish();
}).catch(function(err){
  console.error(err);
  if (!cached) {
    DATA = { prices: DEFAULT_PRICES };
    render();
  }
  var st = one('#dataStatus');
  if (st) {
    st.textContent = cached ? 'Menampilkan data tersimpan. Update terbaru belum dapat dimuat.' : 'Price list lokal ditampilkan. Data Supabase belum dapat dimuat.';
  }
  finish();
});

})();
