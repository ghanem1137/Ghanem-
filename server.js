// ويكند سعيد — خادم بسيط بدون أي مكتبات خارجية (Node.js فقط)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'weekend123';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const id = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();

// ---------- البيانات ----------

function seed() {
  return {
    issue: {
      number: 1,
      title: 'ويكند سعيد',
      greeting: 'هلا والله! خلّصنا الأسبوع على خير، وهذا عددنا الجديد عشان تبدأ الويكند برواق 😊',
      dateFrom: '', dateTo: '',
      quote: 'الراحة مو كسل… الراحة وقود للأسبوع الجاي.',
    },
    matches: [
      { id: id(), league: 'دوري روشن السعودي', home: 'الهلال', away: 'النصر', day: 'الجمعة', time: '9:00 م', channel: 'SSC 1', stadium: 'المملكة أرينا' },
      { id: id(), league: 'دوري روشن السعودي', home: 'الاتحاد', away: 'الأهلي', day: 'السبت', time: '8:30 م', channel: 'SSC 1', stadium: 'الجوهرة المشعة' },
      { id: id(), league: 'الدوري الإسباني', home: 'ريال مدريد', away: 'برشلونة', day: 'السبت', time: '10:00 م', channel: 'beIN Sports 1', stadium: 'سانتياغو برنابيو' },
      { id: id(), league: 'الدوري الإنجليزي', home: 'ليفربول', away: 'مانشستر سيتي', day: 'الجمعة', time: '7:30 م', channel: 'beIN Sports 2', stadium: 'أنفيلد' },
    ],
    poll: { id: id(), question: 'مين تتوقع يفوز في الكلاسيكو؟', home: 'الهلال', away: 'النصر', allowDraw: true, closed: false, votes: {} },
    recommendations: [
      { id: id(), category: 'cafe', title: 'قهوة الجمعة', colleague: 'أحمد', itemName: 'كافيه المرسى', description: 'قهوتهم المختصة ممتازة والجلسة على البحر تفتح النفس.', location: 'كورنيش جازان', link: '' },
      { id: id(), category: 'restaurant', title: 'عشاء الويكند', colleague: 'سارة', itemName: 'مطعم البيت الجازاني', description: 'جربوا المغش والحنيذ، طعم ولا أروع.', location: 'جازان', link: '' },
      { id: id(), category: 'movie', title: 'فيلم السهرة', colleague: 'خالد', itemName: 'The Martian', description: 'فيلم خفيف وممتع عن الصبر وحل المشكلات.', location: '', link: '' },
      { id: id(), category: 'book', title: 'كتاب الويكند', colleague: 'نورة', itemName: 'العادات الذرية', description: 'تغييرات صغيرة تصنع فرق كبير، أسلوبه سهل ومشوّق.', location: '', link: '' },
    ],
    creative: [
      { id: id(), type: 'poem', title: 'صباح جازان', author: 'محمد', body: 'يا صباحٍ فيه ريحة فلّ جازان\nوالبحر يضحك لنا من غير ميعاد', link: '' },
    ],
    selfdev: [
      { id: id(), title: 'قاعدة الدقيقتين', summary: 'إذا المهمة تاخذ أقل من دقيقتين، سوّها الحين ولا تأجلها. بسيطة لكنها تخفف الزحمة اللي في راسك.', source: 'ديفيد آلن', link: '', readMinutes: 3 },
    ],
    occasions: [
      { id: id(), type: 'welcome', person: 'ريم', text: 'حيّاك الله في فريقنا، نتمنى لك بداية حلوة!' },
    ],
    quiz: {
      id: id(), question: 'وش اسم الجزيرة الشهيرة التابعة لجازان واللي تعتبر وجهة سياحية في البحر الأحمر؟',
      hint: 'تبدأ بحرف الفاء 😉', accepted: ['فرسان', 'جزيرة فرسان', 'جزر فرسان'],
      prize: 'كوبون قهوة ☕', closed: false, winner: null, answers: [],
    },
    photos: [],
    featuredPhotoId: null,
    likes: {},      // targetId -> [voterId]
    comments: [],   // {id, targetId, name, text, createdAt}
    suggestions: [],
  };
}

let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  db = seed();
  saveNow();
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

// ---------- التحديث الحي (SSE) ----------

const clients = new Set();
function broadcast() {
  for (const res of clients) res.write('data: changed\n\n');
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---------- أدوات ----------

const adminTokens = new Set();

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

function normalizeArabic(s) {
  return str(s, 200)
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').toLowerCase();
}

function isAdmin(req) {
  return adminTokens.has(req.headers['x-admin-token']);
}

// الحالة العامة المرسلة للجميع (بدون الإجابات الصحيحة وصندوق الاقتراحات)
function publicState(voterId) {
  const pollCounts = { home: 0, draw: 0, away: 0 };
  for (const c of Object.values(db.poll.votes)) if (c in pollCounts) pollCounts[c]++;
  const likes = {};
  for (const [t, arr] of Object.entries(db.likes)) likes[t] = { count: arr.length, mine: arr.includes(voterId) };
  const { accepted, answers, ...quiz } = db.quiz;
  return {
    issue: db.issue,
    matches: db.matches,
    poll: { ...db.poll, votes: undefined, counts: pollCounts, myVote: db.poll.votes[voterId] || null },
    recommendations: db.recommendations,
    creative: db.creative,
    selfdev: db.selfdev,
    occasions: db.occasions,
    quiz: { ...quiz, answersCount: answers.length, answered: answers.some((a) => a.voterId === voterId), accepted: quiz.closed ? accepted : undefined },
    photos: db.photos.filter((p) => p.approved || p.id === db.featuredPhotoId),
    featuredPhotoId: db.featuredPhotoId,
    likes,
    comments: db.comments.map(({ voterId: _, ...c }) => c),
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
  const name = `${id()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

function deleteImage(url) {
  const file = path.join(UPLOAD_DIR, path.basename(url || ''));
  fs.rm(file, { force: true }, () => {});
}

// ---------- الأقسام القابلة للتعديل من الإدارة ----------

const LIST_SECTIONS = {
  matches: ['league', 'home', 'away', 'day', 'time', 'channel', 'stadium'],
  recommendations: ['category', 'title', 'colleague', 'itemName', 'description', 'location', 'link'],
  creative: ['type', 'title', 'author', 'body', 'link'],
  selfdev: ['title', 'summary', 'source', 'link', 'readMinutes'],
  occasions: ['type', 'person', 'text'],
};

function cleanItem(fields, item) {
  const out = { id: /^[a-f0-9]{12}$/.test(item.id) ? item.id : id() };
  for (const f of fields) out[f] = str(item[f], f === 'body' || f === 'summary' || f === 'description' ? 5000 : 300);
  return out;
}

// ---------- المسارات ----------

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const voterId = str(req.headers['x-voter-id'], 64);

  if (m === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (m === 'GET' && p === '/api/state') return send(res, 200, publicState(voterId));

  const body = await readBody(req, p === '/api/photos' ? 8 * 1024 * 1024 : 256 * 1024);
  const need = (cond, msg) => { if (!cond) throw Object.assign(new Error(msg), { status: 400 }); };

  // --- مشاركات الموظفين ---
  if (m === 'POST' && p === '/api/poll/vote') {
    need(voterId, 'معرّف غير موجود');
    need(!db.poll.closed, 'الاستطلاع مقفل');
    need(['home', 'draw', 'away'].includes(body.choice) && (body.choice !== 'draw' || db.poll.allowDraw), 'اختيار غير صالح');
    db.poll.votes[voterId] = body.choice;
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/like') {
    need(voterId, 'معرّف غير موجود');
    const t = str(body.targetId, 64);
    need(t, 'العنصر غير موجود');
    const arr = db.likes[t] || (db.likes[t] = []);
    const i = arr.indexOf(voterId);
    if (i >= 0) arr.splice(i, 1); else arr.push(voterId);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/comments') {
    const c = { id: id(), targetId: str(body.targetId, 64), name: str(body.name, 60), text: str(body.text, 1000), voterId, createdAt: now() };
    need(c.targetId && c.name && c.text, 'اكتب اسمك وتعليقك');
    db.comments.push(c);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/quiz/answer') {
    need(voterId, 'معرّف غير موجود');
    need(!db.quiz.closed, 'المسابقة انتهت، انتظرونا العدد الجاي');
    need(!db.quiz.answers.some((a) => a.voterId === voterId), 'شاركت من قبل، بالتوفيق!');
    const a = { id: id(), voterId, name: str(body.name, 60), dept: str(body.dept, 60), answer: str(body.answer, 200), createdAt: now() };
    need(a.name && a.answer, 'اكتب اسمك وإجابتك');
    db.quiz.answers.push(a);
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/photos') {
    const name = str(body.name, 60);
    need(name, 'اكتب اسمك');
    const url = saveImage(body.image);
    db.photos.push({ id: id(), name, caption: str(body.caption, 200), url, approved: false, createdAt: now() });
    save(); broadcast();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/suggestions') {
    const s = { id: id(), name: str(body.name, 60), type: str(body.type, 40), text: str(body.text, 3000), link: str(body.link, 500), createdAt: now(), done: false };
    need(s.text, 'اكتب مشاركتك أو اقتراحك');
    db.suggestions.push(s);
    save();
    return send(res, 200, { ok: true });
  }

  // --- الإدارة ---
  if (m === 'POST' && p === '/api/admin/login') {
    const a = Buffer.from(str(body.password, 200));
    const b = Buffer.from(ADMIN_PASSWORD);
    need(a.length === b.length && crypto.timingSafeEqual(a, b), 'كلمة المرور غير صحيحة');
    const token = crypto.randomBytes(24).toString('hex');
    adminTokens.add(token);
    return send(res, 200, { token });
  }

  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'سجّل دخول الإدارة أولاً' });

    if (m === 'GET' && p === '/api/admin/data') {
      return send(res, 200, { suggestions: db.suggestions, quiz: db.quiz, photos: db.photos, poll: db.poll });
    }

    const sec = /^\/api\/admin\/section\/(\w+)$/.exec(p);
    if (m === 'PUT' && sec) {
      const key = sec[1];
      if (LIST_SECTIONS[key]) {
        need(Array.isArray(body.items), 'بيانات غير صالحة');
        db[key] = body.items.slice(0, 50).map((it) => cleanItem(LIST_SECTIONS[key], it || {}));
      } else if (key === 'issue') {
        for (const f of ['title', 'greeting', 'dateFrom', 'dateTo', 'quote']) db.issue[f] = str(body[f], 1000);
        db.issue.number = Math.max(1, parseInt(body.number, 10) || 1);
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

    const cm = /^\/api\/admin\/comments\/(\w+)$/.exec(p);
    if (m === 'DELETE' && cm) {
      db.comments = db.comments.filter((c) => c.id !== cm[1]);
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
  }

  return send(res, 404, { error: 'غير موجود' });
}

// ---------- الملفات الثابتة ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let root = PUBLIC_DIR;
  if (rel.startsWith('/uploads/')) { root = UPLOAD_DIR; rel = rel.slice('/uploads'.length); }
  if (rel === '/' || rel === '/admin') rel = rel === '/' ? '/index.html' : '/admin.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('الصفحة غير موجودة'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
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
  console.log(`ويكند سعيد شغّال على http://localhost:${PORT}`);
  console.log(`لوحة الإدارة: http://localhost:${PORT}/admin`);
});
