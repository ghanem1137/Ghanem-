// ويكند سعيد — خادم بسيط بدون أي مكتبات خارجية (Node.js فقط)
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'weekend123';
const WEATHER_API = process.env.WEATHER_API || 'https://api.open-meteo.com';
const GEO_API = process.env.GEO_API || 'https://geocoding-api.open-meteo.com';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 30;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const id = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

// ---------- البيانات ----------

// أحجام المشاركات: صغير (٤ في الصف)، متوسط (٣)، كبير (٢)، عرض كامل
const SIZES = ['sm', 'md', 'lg', 'full'];
const DEFAULT_SIZES = { occasions: 'md', matches: 'sm', poll: 'full', recs: 'md', lens: 'sm', creative: 'full', selfdev: 'md', quiz: 'full', box: 'full' };
// عرض القسم في الصفحة: ربع، ثلث، نص، أو كامل. الأقسام تصطف جنب بعض وتتمدد لين تعبّي الصف بدون فراغات
const WIDTHS = ['quarter', 'third', 'half', 'full'];
const DEFAULT_WIDTHS = { occasions: 'full', matches: 'full', poll: 'half', recs: 'full', lens: 'full', creative: 'half', selfdev: 'half', quiz: 'half', box: 'full' };
// مفتاح القسم ← مكان مشاركاته في البيانات
const SECTION_LIST = { matches: 'matches', recs: 'recommendations', creative: 'creative', selfdev: 'selfdev', occasions: 'occasions' };

// ترتيب الأقسام وعناوينها الافتراضية (الإدارة تقدر تعدّلها كلها)
const DEFAULT_SECTIONS = [
  ['occasions', '🎉', 'مناسبات الزملاء', 'نفرح لفرحهم ونرحّب بالجدد', 'المناسبات'],
  ['matches', '⚽', 'مباريات الويكند', 'أقوى أربع مباريات الجمعة والسبت، جهّز القهوة والمكسرات 🍿', 'المباريات'],
  ['poll', '🔮', 'توقّع وخلّك شجاع', 'صوّت وشوف وش رأي الزملاء في المكتب', 'توقّع'],
  ['recs', '💡', 'توصية من زميل', 'مطعم، كافيه، فيلم، كتاب… من ناس تعرفهم وتثق بذوقهم', 'توصيات الزملاء'],
  ['lens', '📸', 'عدسة الموظف', 'صوّرت شي حلو في الويكند؟ أرسله، وأحلى صورة تنزل في العدد الجاي', 'عدسة الموظف'],
  ['creative', '✍️', 'ركن إبداع الزملاء', 'مقالة، بودكاست، أو قصيدة… من قلم وصوت زملائنا', 'ركن الإبداع'],
  ['selfdev', '🌱', 'طوّر نفسك على رواق', 'قراءات قصيرة تنفعك بدون ما تثقل عليك', 'طوّر نفسك'],
  ['quiz', '🧩', 'مسابقة الويكند السريعة', 'سؤال خفيف، وجاوب صح وادخل السحب', 'المسابقة'],
  ['box', '📮', 'صندوق المشاركات والاقتراحات', 'عندك توصية، مقالة، قصيدة، فكرة للعدد الجاي، أو ملاحظة؟ هذا مكانها', 'شاركنا'],
].map(([key, emoji, title, subtitle, nav]) => ({
  key, emoji, title, subtitle, nav, visible: true, size: DEFAULT_SIZES[key], width: DEFAULT_WIDTHS[key], image: '', fileUrl: '', fileName: '',
}));
const SECTION_KEYS = DEFAULT_SECTIONS.map((s) => s.key);

function seed() {
  // بداية جديدة: العدد الأول بدون أي محتوى، وفريق النشرة يعبّيه من لوحة الإدارة
  return {
    issue: {
      number: 1,
      title: 'ويكند سعيد',
      greeting: 'هلا والله! هذا أول عدد من نشرتنا، وبنكمّلها سوا كل ويكند 😊',
      dateFrom: '', dateTo: '', quote: '',
      footer: 'ويكند سعيد — من الفريق، للفريق 💛',
      siteUrl: '',
      orgName: 'المكتب الاستراتيجي لتطوير منطقة جازان',
      orgNameEn: 'JAZAN REGION DEVELOPMENT STRATEGIC OFFICE',
      logo: '/logo.png',
    },
    sections: DEFAULT_SECTIONS,
    weather: { enabled: true, city: 'جازان', lat: 16.8892, lon: 42.5511 },
    matches: [],
    poll: { id: id(), question: '', home: '', away: '', allowDraw: true, closed: false, votes: {} },
    recommendations: [],
    creative: [],
    selfdev: [],
    occasions: [],
    quiz: { id: id(), question: '', hint: '', accepted: [], prize: '', closed: false, winner: null, answers: [] },
    photos: [],
    featuredPhotoId: null,
    likes: {},      // targetId -> [userId]
    comments: [],   // {id, targetId, userId, name, text, createdAt}
    suggestions: [],
    users: [],      // {id, name, email, username, pass, isAdmin, createdAt, lastLogin}
    sessions: {},   // sha256(token) -> {userId, exp}
  };
}

let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  db = seed();
}
// ترقية البيانات من النسخ السابقة: نضيف أي حقل ناقص بدون ما نلمس الموجود
{
  const fresh = seed();
  for (const k of Object.keys(fresh)) if (db[k] === undefined) db[k] = fresh[k];
  for (const k of Object.keys(fresh.issue)) if (db.issue[k] === undefined) db.issue[k] = fresh.issue[k];
  db.sections = normalizeSections(db.sections);
  // النسخ السابقة ما كان فيها شعار: نستخدم شعار الجهة الأساسي إلا إذا المدير حذفه بنفسه
  if (!db.issue.logo && !db.issue.logoRemoved) db.issue.logo = '/logo.png';
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}
function saveNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- كلمات المرور والحسابات ----------

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// كلمة مرور سهلة القراءة (بدون الحروف المتشابهة مثل O و0 و l و1)
function makePassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;

function makeUsername(email) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user';
  let u = base;
  for (let n = 2; db.users.some((x) => x.username === u); n++) u = `${base}${n}`;
  return u;
}

function nameFromEmail(email) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, username: u.username, isAdmin: !!u.isAdmin, createdAt: u.createdAt, lastLogin: u.lastLogin || null });

// أول تشغيل: حساب مدير افتراضي
if (!db.users.some((u) => u.isAdmin)) {
  db.users.push({ id: id(), name: 'مدير النشرة', email: '', username: 'admin', pass: hashPassword(ADMIN_PASSWORD), isAdmin: true, createdAt: now() });
  console.log('تم إنشاء حساب الإدارة: admin');
  if (!process.env.ADMIN_PASSWORD) console.log('⚠️  كلمة المرور الافتراضية weekend123 — غيّرها من المنصة بعد أول دخول');
}
saveNow();

// ---------- الجلسات ----------

const tokenKey = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const t = parseCookies(req).wk_session;
  if (!t) return null;
  const s = db.sessions[tokenKey(t)];
  if (!s || s.exp < Date.now()) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}

function startSession(res, user) {
  const t = crypto.randomBytes(32).toString('hex');
  db.sessions[tokenKey(t)] = { userId: user.id, exp: Date.now() + SESSION_DAYS * 864e5 };
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < Date.now()) delete db.sessions[k];
  res.setHeader('Set-Cookie', `wk_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
}

function endSessions(userId) {
  for (const [k, s] of Object.entries(db.sessions)) if (s.userId === userId) delete db.sessions[k];
}

// حماية بسيطة من تخمين كلمات المرور: 10 محاولات خاطئة كل 15 دقيقة لكل جهاز
const failed = new Map();
function tooManyFailures(ip) {
  const f = failed.get(ip);
  if (!f || f.until < Date.now()) return false;
  return f.count >= 10;
}
function noteFailure(ip) {
  const f = failed.get(ip);
  if (!f || f.until < Date.now()) failed.set(ip, { count: 1, until: Date.now() + 15 * 6e4 });
  else f.count++;
}

// ---------- التحديث الحي (SSE) ----------

const clients = new Set();
function broadcast() {
  for (const res of clients) res.write('data: changed\n\n');
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---------- الطقس (Open-Meteo مجاني وبدون مفتاح) ----------

let weatherCache = { key: '', at: 0, data: null };

async function getWeather() {
  const w = db.weather;
  if (!w.enabled) return null;
  const key = `${w.lat},${w.lon}`;
  if (weatherCache.key === key && Date.now() - weatherCache.at < 30 * 6e4) return weatherCache.data;
  const q = new URLSearchParams({
    latitude: w.lat, longitude: w.lon, timezone: 'auto', forecast_days: 7,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
  });
  try {
    const r = await fetch(`${WEATHER_API}/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const data = {
      city: w.city,
      current: {
        temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature),
        humidity: j.current.relative_humidity_2m, wind: Math.round(j.current.wind_speed_10m), code: j.current.weather_code,
      },
      days: j.daily.time.map((date, i) => ({
        date, code: j.daily.weather_code[i],
        max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]),
      })),
    };
    weatherCache = { key, at: Date.now(), data };
    return data;
  } catch (e) {
    console.error('تعذّر جلب الطقس:', e.message);
    // نرجّع آخر قراءة ناجحة إذا كانت لنفس المدينة، ونعيد المحاولة بعد 5 دقائق
    weatherCache.at = Date.now() - 25 * 6e4;
    return weatherCache.key === key ? weatherCache.data : null;
  }
}

async function geocode(city) {
  const q = new URLSearchParams({ name: city, count: 1, language: 'ar' });
  const r = await fetch(`${GEO_API}/v1/search?${q}`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  return j.results?.[0] || null;
}

// ---------- أدوات ----------

function send(res, status, data) {
  // الترويسة X-Weekend-Saeed تخلي نسخة الملف الواحد تعرف إنها مفتوحة من خادم المنصة
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Weekend-Saeed': '1' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('الحجم كبير'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('بيانات غير صالحة'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function normalizeArabic(s) {
  return str(s, 200)
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').toLowerCase();
}

// يتأكد إن كل قسم موجود مرة وحدة بالضبط، ويحافظ على الترتيب المطلوب
function normalizeSections(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !SECTION_KEYS.includes(s.key) || out.some((x) => x.key === s.key)) continue;
    const d = DEFAULT_SECTIONS.find((x) => x.key === s.key);
    out.push({
      key: s.key, emoji: str(s.emoji, 8), title: str(s.title, 120) || d.title,
      subtitle: str(s.subtitle, 300), nav: str(s.nav, 40) || d.nav, visible: s.visible !== false,
      size: SIZES.includes(s.size) ? s.size : d.size,
      width: WIDTHS.includes(s.width) ? s.width : d.width,
      ...cleanAttach(s),
    });
  }
  for (const d of DEFAULT_SECTIONS) if (!out.some((x) => x.key === d.key)) out.push({ ...d });
  return out;
}

// الحالة اللي تنرسل للموظفين (بدون الإجابات الصحيحة وصندوق الاقتراحات وبيانات الحسابات)
function publicState(user) {
  const pollCounts = { home: 0, draw: 0, away: 0 };
  for (const c of Object.values(db.poll.votes)) if (c in pollCounts) pollCounts[c]++;
  const likes = {};
  for (const [t, arr] of Object.entries(db.likes)) likes[t] = { count: arr.length, mine: arr.includes(user.id) };
  const { accepted, answers, ...quiz } = db.quiz;
  return {
    me: { id: user.id, name: user.name, username: user.username, isAdmin: !!user.isAdmin },
    issue: db.issue,
    sections: db.sections,
    weatherCity: db.weather.enabled ? db.weather.city : null,
    matches: db.matches,
    poll: { ...db.poll, votes: undefined, counts: pollCounts, myVote: db.poll.votes[user.id] || null },
    recommendations: db.recommendations,
    creative: db.creative,
    selfdev: db.selfdev,
    occasions: db.occasions,
    quiz: { ...quiz, answersCount: answers.length, answered: answers.some((a) => a.userId === user.id), accepted: quiz.closed ? accepted : undefined },
    photos: db.photos.filter((p) => p.approved || p.id === db.featuredPhotoId).map(({ userId: _, ...p }) => p),
    featuredPhotoId: db.featuredPhotoId,
    likes,
    comments: db.comments.map(({ userId, voterId: _, ...c }) => ({ ...c, mine: userId === user.id })),
  };
}

// حفظ الصور المرفوعة مع التحقق من نوعها الحقيقي
function saveImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('الصورة لازم تكون PNG أو JPG أو WEBP'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  const sig = buf.subarray(0, 12);
  const ok = (sig[0] === 0x89 && sig[1] === 0x50) || (sig[0] === 0xff && sig[1] === 0xd8) ||
    (sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP');
  if (!ok) throw Object.assign(new Error('ملف الصورة غير صالح'), { status: 400 });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

// رفع مرفق (صورة أو مستند) مع التحقق من نوعه الحقيقي من أول بايتات الملف
const ATTACH_TYPES = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  pdf: 'file', docx: 'file', xlsx: 'file', pptx: 'file', doc: 'file', xls: 'file', ppt: 'file',
};
function saveAttachment(dataUrl, name) {
  const m = /^data:[^;,]*;base64,(.+)$/.exec(dataUrl || '');
  const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1];
  if (!m || !ATTACH_TYPES[ext]) throw Object.assign(new Error('الملف لازم يكون صورة (JPG/PNG/WEBP/GIF) أو مستند (PDF/Word/Excel/PowerPoint)'), { status: 400 });
  const buf = Buffer.from(m[1], 'base64');
  const sig = buf.subarray(0, 12);
  const ok = {
    png: () => sig[0] === 0x89 && sig[1] === 0x50,
    jpg: () => sig[0] === 0xff && sig[1] === 0xd8,
    webp: () => sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP',
    gif: () => sig.toString('ascii', 0, 3) === 'GIF',
    pdf: () => sig.toString('ascii', 0, 4) === '%PDF',
    zip: () => sig[0] === 0x50 && sig[1] === 0x4b, // docx/xlsx/pptx
    ole: () => sig.readUInt32BE(0) === 0xd0cf11e0, // doc/xls/ppt القديمة
  };
  const check = { jpeg: 'jpg', docx: 'zip', xlsx: 'zip', pptx: 'zip', doc: 'ole', xls: 'ole', ppt: 'ole' }[ext] || ext;
  if (!ok[check]()) throw Object.assign(new Error('محتوى الملف ما يطابق نوعه'), { status: 400 });
  const file = `${crypto.randomBytes(12).toString('hex')}.${ext === 'jpeg' ? 'jpg' : ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return { url: `/uploads/${file}`, name: str(name, 120), kind: ATTACH_TYPES[ext] };
}

function deleteImage(url) {
  const file = path.join(UPLOAD_DIR, path.basename(url || ''));
  fs.rm(file, { force: true }, () => {});
}

// ---------- الأقسام القابلة للتعديل من الإدارة ----------

const LIST_SECTIONS = {
  matches: ['league', 'home', 'away', 'day', 'time', 'channel', 'stadium', 'size'],
  recommendations: ['category', 'title', 'colleague', 'itemName', 'description', 'location', 'link', 'size'],
  creative: ['type', 'title', 'author', 'body', 'link', 'size'],
  selfdev: ['title', 'summary', 'source', 'link', 'readMinutes', 'size'],
  occasions: ['type', 'person', 'text', 'size'],
};

// المرفقات الاختيارية (صورة و/أو مستند): نقبل فقط ملفات مرفوعة على المنصة
function cleanAttach(x) {
  const up = (u) => (/^\/uploads\/[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(String(u || '')) ? u : '');
  const fileUrl = up(x.fileUrl);
  return { image: up(x.image), fileUrl, fileName: fileUrl ? str(x.fileName, 120) || 'مرفق' : '' };
}

function cleanItem(fields, item) {
  const out = { id: /^[a-f0-9]{12}$/.test(item.id) ? item.id : id() };
  for (const f of fields) out[f] = str(item[f], f === 'body' || f === 'summary' || f === 'description' ? 5000 : 300);
  if ('size' in out && !SIZES.includes(out.size)) out.size = ''; // فاضي = حسب إعداد القسم
  return { ...out, ...cleanAttach(item) };
}

// ---------- المسارات ----------

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const need = (cond, msg, status = 400) => { if (!cond) throw Object.assign(new Error(msg), { status }); };

  // --- الدخول (بدون جلسة) ---
  if (m === 'POST' && p === '/api/login') {
    const ip = req.socket.remoteAddress;
    need(!tooManyFailures(ip), 'محاولات كثيرة، جرّب بعد ربع ساعة', 429);
    const body = await readBody(req, 16 * 1024);
    const login = str(body.username, 200).toLowerCase();
    const user = db.users.find((u) => u.username === login || (u.email && u.email.toLowerCase() === login));
    if (!user || !checkPassword(String(body.password || ''), user.pass)) {
      noteFailure(ip);
      need(false, 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);
    }
    failed.delete(ip);
    user.lastLogin = now();
    startSession(res, user);
    save();
    return send(res, 200, { ok: true, isAdmin: !!user.isAdmin });
  }

  if (m === 'POST' && p === '/api/logout') {
    const t = parseCookies(req).wk_session;
    if (t) { delete db.sessions[tokenKey(t)]; save(); }
    res.setHeader('Set-Cookie', 'wk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  // هوية الجهة لصفحة الدخول (بدون بيانات حساسة)
  if (m === 'GET' && p === '/api/brand') {
    const { title, orgName, orgNameEn, logo } = db.issue;
    return send(res, 200, { title, orgName, orgNameEn, logo });
  }

  // --- كل اللي بعد هذا يحتاج دخول ---
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'سجّل دخولك أولاً' });

  if (m === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (m === 'GET' && p === '/api/state') return send(res, 200, publicState(user));
  if (m === 'GET' && p === '/api/weather') return send(res, 200, { weather: await getWeather() });

  const big = { '/api/photos': 8, '/api/admin/logo': 8, '/api/admin/upload': 22 }[p];
  const body = await readBody(req, (big || 0.5) * 1024 * 1024);

  if (m === 'POST' && p === '/api/me/password') {
    need(checkPassword(String(body.current || ''), user.pass), 'كلمة المرور الحالية غير صحيحة');
    const next = String(body.next || '');
    need(next.length >= 8, 'كلمة المرور الجديدة لازم تكون 8 أحرف أو أكثر');
    user.pass = hashPassword(next);
    endSessions(user.id);
    startSession(res, user);
    save();
    return send(res, 200, { ok: true });
  }

  // --- مشاركات الموظفين ---
  if (m === 'POST' && p === '/api/poll/vote') {
    need(db.poll.home && db.poll.away, 'ما فيه استطلاع حالياً');
    need(!db.poll.closed, 'الاستطلاع مقفل');
    need(['home', 'draw', 'away'].includes(body.choice) && (body.choice !== 'draw' || db.poll.allowDraw), 'اختيار غير صالح');
    db.poll.votes[user.id] = body.choice;
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/like') {
    const t = str(body.targetId, 64);
    need(t, 'العنصر غير موجود');
    const arr = db.likes[t] || (db.likes[t] = []);
    const i = arr.indexOf(user.id);
    if (i >= 0) arr.splice(i, 1); else arr.push(user.id);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/comments') {
    const c = { id: id(), targetId: str(body.targetId, 64), userId: user.id, name: user.name, text: str(body.text, 1000), createdAt: now() };
    need(c.targetId && c.text, 'اكتب تعليقك');
    db.comments.push(c);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  const myComment = /^\/api\/comments\/(\w+)$/.exec(p);
  if (m === 'DELETE' && myComment) {
    const c = db.comments.find((x) => x.id === myComment[1]);
    need(c && (c.userId === user.id || user.isAdmin), 'ما تقدر تحذف هذا التعليق', 403);
    db.comments = db.comments.filter((x) => x !== c);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/quiz/answer') {
    need(db.quiz.question, 'ما فيه مسابقة حالياً');
    need(!db.quiz.closed, 'المسابقة انتهت، انتظرونا العدد الجاي');
    need(!db.quiz.answers.some((a) => a.userId === user.id), 'شاركت من قبل، بالتوفيق!');
    const a = { id: id(), userId: user.id, name: user.name, dept: str(body.dept, 60), answer: str(body.answer, 200), createdAt: now() };
    need(a.answer, 'اكتب إجابتك');
    db.quiz.answers.push(a);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/photos') {
    const url = saveImage(body.image);
    db.photos.push({ id: id(), userId: user.id, name: user.name, caption: str(body.caption, 200), url, approved: false, createdAt: now() });
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/suggestions') {
    const s = {
      id: id(), name: body.anonymous ? '' : user.name, type: str(body.type, 40),
      text: str(body.text, 3000), link: str(body.link, 500), createdAt: now(), done: false,
    };
    need(s.text, 'اكتب مشاركتك أو اقتراحك');
    db.suggestions.push(s);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  // --- الإدارة ---
  if (p.startsWith('/api/admin/')) {
    need(user.isAdmin, 'هذي الصفحة لفريق النشرة فقط', 403);

    if (m === 'GET' && p === '/api/admin/data') {
      return send(res, 200, { suggestions: db.suggestions, quiz: db.quiz, photos: db.photos, poll: db.poll, weather: db.weather });
    }

    const sec = /^\/api\/admin\/section\/(\w+)$/.exec(p);
    if (m === 'PUT' && sec) {
      const key = sec[1];
      if (LIST_SECTIONS[key]) {
        need(Array.isArray(body.items), 'بيانات غير صالحة');
        db[key] = body.items.slice(0, 50).map((it) => cleanItem(LIST_SECTIONS[key], it || {}));
      } else if (key === 'issue') {
        for (const f of ['title', 'greeting', 'dateFrom', 'dateTo', 'quote', 'footer', 'orgName', 'orgNameEn']) db.issue[f] = str(body[f], 1000);
        const site = str(body.siteUrl, 300).replace(/\/+$/, '');
        need(!site || /^https?:\/\/[^\s]+$/.test(site), 'رابط المنصة لازم يبدأ بـ http:// أو https://');
        db.issue.siteUrl = site;
        db.issue.number = Math.max(1, parseInt(body.number, 10) || 1);
      } else if (key === 'sections') {
        db.sections = normalizeSections(body.sections);
      } else if (key === 'weather') {
        const city = str(body.city, 80);
        need(city, 'اكتب اسم المدينة');
        if (city !== db.weather.city) {
          let place = null;
          try { place = await geocode(city); } catch { need(false, 'تعذّر الاتصال بخدمة الطقس، جرّب بعدين'); }
          need(place, 'ما لقينا هالمدينة، جرّب اسم ثاني (بالعربي أو الإنجليزي)');
          Object.assign(db.weather, { city, lat: place.latitude, lon: place.longitude });
        }
        db.weather.enabled = !!body.enabled;
      } else if (key === 'poll') {
        const changed = str(body.home) !== db.poll.home || str(body.away) !== db.poll.away;
        Object.assign(db.poll, { question: str(body.question, 300), home: str(body.home, 80), away: str(body.away, 80), allowDraw: !!body.allowDraw, closed: !!body.closed });
        if (changed || body.reset) { db.poll.votes = {}; db.poll.id = id(); }
      } else if (key === 'quiz') {
        const fresh = !!body.reset;
        Object.assign(db.quiz, {
          question: str(body.question, 1000), hint: str(body.hint, 300), prize: str(body.prize, 200), closed: !!body.closed,
          accepted: String(body.accepted || '').split(/[,،\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
        });
        if (fresh) Object.assign(db.quiz, { id: id(), answers: [], winner: null, closed: false });
      } else {
        need(false, 'قسم غير معروف');
      }
      save(); broadcast();
      return send(res, 200, { ok: true });
    }

    if (m === 'POST' && p === '/api/admin/upload') {
      return send(res, 200, saveAttachment(body.data, body.name));
    }

    // تغيير الحجم مباشرة من الصفحة: عرض القسم، أو حجم مشاركة وحدة
    if (m === 'POST' && p === '/api/admin/layout') {
      const sec = db.sections.find((x) => x.key === body.section);
      need(sec, 'القسم غير موجود');
      if (body.itemId) {
        const item = (db[SECTION_LIST[sec.key]] || []).find((x) => x.id === body.itemId);
        need(item, 'المشاركة غير موجودة');
        need(body.size === '' || SIZES.includes(body.size), 'حجم غير صالح');
        item.size = body.size;
      } else {
        if (body.width !== undefined) { need(WIDTHS.includes(body.width), 'عرض غير صالح'); sec.width = body.width; }
        if (body.size !== undefined) { need(SIZES.includes(body.size), 'حجم غير صالح'); sec.size = body.size; }
      }
      save(); broadcast();
      return send(res, 200, { ok: true });
    }

    if (m === 'POST' && p === '/api/admin/logo') {
      const old = db.issue.logo;
      db.issue.logo = body.reset ? '/logo.png' : body.image ? saveImage(body.image) : '';
      db.issue.logoRemoved = !db.issue.logo;
      if (old && old.startsWith('/uploads/') && old !== db.issue.logo) deleteImage(old);
      save(); broadcast();
      return send(res, 200, { logo: db.issue.logo });
    }

    if (m === 'POST' && p === '/api/admin/quiz/draw') {
      const correct = new Set(db.quiz.accepted.map(normalizeArabic));
      const pool = db.quiz.answers.filter((a) => correct.has(normalizeArabic(a.answer)));
      need(pool.length, 'ما فيه إجابات صحيحة للسحب');
      const w = pool[crypto.randomInt(pool.length)];
      db.quiz.winner = { name: w.name, dept: w.dept, correctCount: pool.length, drawnAt: now() };
      db.quiz.closed = true;
      save(); broadcast();
      return send(res, 200, { winner: db.quiz.winner });
    }

    const ph = /^\/api\/admin\/photos\/(\w+)\/(approve|feature|delete)$/.exec(p);
    if (m === 'POST' && ph) {
      const photo = db.photos.find((x) => x.id === ph[1]);
      need(photo, 'الصورة غير موجودة');
      if (ph[2] === 'approve') photo.approved = !photo.approved;
      if (ph[2] === 'feature') { db.featuredPhotoId = db.featuredPhotoId === photo.id ? null : photo.id; photo.approved = true; }
      if (ph[2] === 'delete') {
        db.photos = db.photos.filter((x) => x !== photo);
        if (db.featuredPhotoId === photo.id) db.featuredPhotoId = null;
        deleteImage(photo.url);
      }
      save(); broadcast();
      return send(res, 200, { ok: true });
    }

    const sg = /^\/api\/admin\/suggestions\/(\w+)$/.exec(p);
    if (sg && (m === 'POST' || m === 'DELETE')) {
      if (m === 'DELETE') db.suggestions = db.suggestions.filter((s) => s.id !== sg[1]);
      else { const s = db.suggestions.find((x) => x.id === sg[1]); if (s) s.done = !s.done; }
      save();
      return send(res, 200, { ok: true });
    }

    // --- حسابات الموظفين ---
    if (m === 'GET' && p === '/api/admin/users') return send(res, 200, { users: db.users.map(publicUser) });

    if (m === 'POST' && p === '/api/admin/users/import') {
      // كل سطر: اسم + إيميل (بأي ترتيب، مفصولين بفاصلة أو Tab من الإكسل)، أو إيميل بس
      const lines = String(body.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3000);
      const created = [];
      const skipped = [];
      for (const line of lines) {
        const parts = line.split(/[\t,،;]+/).map((x) => x.trim().replace(/^<|>$/g, '')).filter(Boolean);
        const email = parts.find((x) => EMAIL_RE.test(x))?.toLowerCase();
        if (!email) { skipped.push({ line, reason: 'ما فيه إيميل صحيح' }); continue; }
        if (db.users.some((u) => u.email === email)) { skipped.push({ line, reason: 'الحساب موجود من قبل' }); continue; }
        const name = str(parts.filter((x) => x.toLowerCase() !== email).join(' '), 80) || nameFromEmail(email);
        const password = makePassword();
        const u = { id: id(), name, email, username: makeUsername(email), pass: hashPassword(password), isAdmin: false, createdAt: now() };
        db.users.push(u);
        created.push({ name, email, username: u.username, password });
      }
      save();
      return send(res, 200, { created, skipped });
    }

    const us = /^\/api\/admin\/users\/(\w+)(\/reset)?$/.exec(p);
    if (us) {
      const target = db.users.find((u) => u.id === us[1]);
      need(target, 'الحساب غير موجود', 404);
      if (m === 'POST' && us[2]) {
        const password = makePassword();
        target.pass = hashPassword(password);
        endSessions(target.id);
        save();
        return send(res, 200, { name: target.name, email: target.email, username: target.username, password });
      }
      if (m === 'PUT' && !us[2]) {
        const name = str(body.name, 80);
        need(name, 'اكتب اسم صاحب الحساب');
        const makeAdmin = !!body.isAdmin;
        need(makeAdmin || !target.isAdmin || db.users.filter((u) => u.isAdmin).length > 1, 'لازم يبقى مدير واحد على الأقل');
        target.name = name;
        target.isAdmin = makeAdmin;
        save(); broadcast();
        return send(res, 200, { ok: true });
      }
      if (m === 'DELETE' && !us[2]) {
        need(target.id !== user.id, 'ما تقدر تحذف حسابك وأنت داخل فيه');
        need(!target.isAdmin || db.users.filter((u) => u.isAdmin).length > 1, 'لازم يبقى مدير واحد على الأقل');
        db.users = db.users.filter((u) => u !== target);
        endSessions(target.id);
        save();
        return send(res, 200, { ok: true });
      }
    }
  }

  return send(res, 404, { error: 'غير موجود' });
}

// ---------- الملفات الثابتة ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.gif': 'image/gif', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword', '.xls': 'application/vnd.ms-excel', '.ppt': 'application/vnd.ms-powerpoint',
};

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  let root = PUBLIC_DIR;
  if (rel.startsWith('/uploads/')) {
    // الصور المعتمدة تظهر حتى في نسخة الإيميل، واللي تحت المراجعة للإدارة فقط
    // والمرفقات للموظفين اللي داخلين، وصور عدسة الموظف اللي ما انعتمدت للإدارة فقط
    const photo = db.photos.find((x) => x.url === rel);
    const viewer = currentUser(req);
    const visible = rel === db.issue.logo || (photo && (photo.approved || photo.id === db.featuredPhotoId)) || (!photo && viewer);
    if (!visible && !viewer?.isAdmin) { res.writeHead(404); return res.end(); }
    root = UPLOAD_DIR;
    rel = rel.slice('/uploads'.length);
  }
  const pages = { '/': '/index.html', '/admin': '/admin.html', '/login': '/login.html' };
  rel = pages[rel] || rel;
  // نسخة الملف الواحد (dist/weekend-saeed.html) تنخدم بعد من نفس الخادم
  if (rel === '/weekend-saeed.html' && root === PUBLIC_DIR) root = path.join(__dirname, 'dist');
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('الصفحة غير موجودة'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  try {
    await api(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'صار خطأ، جرّب مرة ثانية' });
    if (!e.status) console.error(e);
  }
}).listen(PORT, () => {
  console.log(`\nويكند سعيد شغّال ✅`);
  console.log(`  على هذا الجهاز:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  للموظفين:        http://${a.address}:${PORT}`);
    }
  }
  console.log(`  لوحة الإدارة:    http://localhost:${PORT}/admin\n`);
});
