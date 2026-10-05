// ويكند سعيد — النسخة المستقلة (ملف HTML واحد)
// هذا الملف يقوم مقام server.js داخل المتصفح: نفس المسارات ونفس المنطق،
// والبيانات تنحفظ في localStorage لهذا المتصفح فقط.
'use strict';
(function () {
  const KEY = 'weekend-saeed-data-v1';
  const SKEY = 'weekend-saeed-session';
  const WKEY = 'weekend-saeed-weather';
  const WEATHER_API = 'https://api.open-meteo.com';
  const GEO_API = 'https://geocoding-api.open-meteo.com';

  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const now = () => new Date().toISOString();
  const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* تجاهل */ } },
  };

  // الشعار الأساسي يندمج داخل الملف وقت البناء (build-single.js)
  const DEFAULT_LOGO = '__DEFAULT_LOGO__';
  const SIZES = ['sm', 'md', 'lg', 'full'];
  const DEFAULT_SIZES = { occasions: 'md', matches: 'sm', poll: 'full', recs: 'md', lens: 'sm', creative: 'full', selfdev: 'md', quiz: 'full', box: 'full' };
  const SECTIONS = [
    ['occasions', '🎉', 'مناسبات الزملاء', 'نفرح لفرحهم ونرحّب بالجدد', 'المناسبات'],
    ['matches', '⚽', 'مباريات الويكند', 'أقوى أربع مباريات الجمعة والسبت، جهّز القهوة والمكسرات 🍿', 'المباريات'],
    ['poll', '🔮', 'توقّع وخلّك شجاع', 'صوّت وشوف وش رأي الزملاء في المكتب', 'توقّع'],
    ['recs', '💡', 'توصية من زميل', 'مطعم، كافيه، فيلم، كتاب… من ناس تعرفهم وتثق بذوقهم', 'توصيات الزملاء'],
    ['lens', '📸', 'عدسة الموظف', 'صوّرت شي حلو في الويكند؟ أرسله، وأحلى صورة تنزل في العدد الجاي', 'عدسة الموظف'],
    ['creative', '✍️', 'ركن إبداع الزملاء', 'مقالة، بودكاست، أو قصيدة… من قلم وصوت زملائنا', 'ركن الإبداع'],
    ['selfdev', '🌱', 'طوّر نفسك على رواق', 'قراءات قصيرة تنفعك بدون ما تثقل عليك', 'طوّر نفسك'],
    ['quiz', '🧩', 'مسابقة الويكند السريعة', 'سؤال خفيف، وجاوب صح وادخل السحب', 'المسابقة'],
    ['box', '📮', 'صندوق المشاركات والاقتراحات', 'عندك توصية، مقالة، قصيدة، فكرة للعدد الجاي، أو ملاحظة؟ هذا مكانها', 'شاركنا'],
  ].map(([key, emoji, title, subtitle, nav]) => ({ key, emoji, title, subtitle, nav, visible: true, size: DEFAULT_SIZES[key] }));

  // ---------- كلمات المرور (SHA-256 مع ملح) ----------
  async function hashPassword(pw, salt = rid() + rid()) {
    const data = new TextEncoder().encode(salt + ':' + pw);
    let hex;
    if (crypto.subtle) {
      hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      // بعض المتصفحات تمنع التشفير للملفات المحلية: نستخدم بصمة بسيطة بدالها
      let h = 0x811c9dc5;
      for (const b of data) h = Math.imul(h ^ b, 16777619) >>> 0;
      hex = 'f' + h.toString(16);
    }
    return `${salt}:${hex}`;
  }
  async function checkPassword(pw, stored) {
    const [salt] = String(stored || '').split(':');
    return !!salt && (await hashPassword(pw, salt)) === stored;
  }
  function makePassword() {
    const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => c[n % c.length]).join('');
  }

  async function seed() {
    return {
      issue: {
        number: 1, title: 'ويكند سعيد', greeting: 'هلا والله! هذا أول عدد من نشرتنا، وبنكمّلها سوا كل ويكند 😊',
        dateFrom: '', dateTo: '', quote: '', footer: 'ويكند سعيد — من الفريق، للفريق 💛', siteUrl: '',
        orgName: 'المكتب الاستراتيجي لتطوير منطقة جازان', orgNameEn: 'JAZAN REGION DEVELOPMENT STRATEGIC OFFICE', logo: DEFAULT_LOGO,
      },
      sections: SECTIONS,
      weather: { enabled: true, city: 'جازان', lat: 16.8892, lon: 42.5511 },
      matches: [],
      poll: { id: rid(), question: '', home: '', away: '', allowDraw: true, closed: false, votes: {} },
      recommendations: [], creative: [], selfdev: [], occasions: [],
      quiz: { id: rid(), question: '', hint: '', accepted: [], prize: '', closed: false, winner: null, answers: [] },
      photos: [], featuredPhotoId: null, likes: {}, comments: [], suggestions: [],
      users: [{ id: rid(), name: 'مدير النشرة', email: '', username: 'admin', pass: await hashPassword('weekend123'), isAdmin: true, createdAt: now() }],
    };
  }

  let db = null;
  async function ready() {
    if (db) return;
    try { db = JSON.parse(ls.get(KEY)); } catch { db = null; }
    if (!db) { db = await seed(); persist(); }
    db.sections = normalizeSections(db.sections);
    if (!db.issue.logo && !db.issue.logoRemoved) db.issue.logo = DEFAULT_LOGO;
  }
  function persist() {
    if (!ls.set(KEY, JSON.stringify(db))) throw err(507, 'مساحة التخزين في المتصفح امتلأت، احذف بعض الصور القديمة من لوحة الإدارة');
  }
  const save = persist;

  // ---------- التحديث الحي بين التبويبات ----------
  const listeners = new Set();
  const broadcast = () => setTimeout(() => listeners.forEach((l) => l.onmessage && l.onmessage({ data: 'changed' })), 0);
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { db = JSON.parse(e.newValue) || db; } catch { /* تجاهل */ }
    broadcast();
  });
  // في وضع الخادم نستخدم التحديث الحي الحقيقي، وفي الوضع المحلي نحاكيه بين تبويبات المتصفح
  const RealEventSource = window.EventSource;
  window.EventSource = function (url, opts) {
    if (MODE === 'server') return new RealEventSource(url, opts);
    const es = { onmessage: null, close() { listeners.delete(es); } };
    listeners.add(es);
    return es;
  };

  // ---------- أدوات ----------
  function err(status, message) { return Object.assign(new Error(message), { status }); }
  const need = (c, msg, status = 400) => { if (!c) throw err(status, msg); };
  const normalizeArabic = (s) => str(s, 200).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').toLowerCase();
  const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, username: u.username, isAdmin: !!u.isAdmin, createdAt: u.createdAt, lastLogin: u.lastLogin || null });
  const LIST = {
    matches: ['league', 'home', 'away', 'day', 'time', 'channel', 'stadium', 'size'],
    recommendations: ['category', 'title', 'colleague', 'itemName', 'description', 'location', 'link', 'size'],
    creative: ['type', 'title', 'author', 'body', 'link', 'size'],
    selfdev: ['title', 'summary', 'source', 'link', 'readMinutes', 'size'],
    occasions: ['type', 'person', 'text'],
  };
  const cleanItem = (fields, it) => {
    const o = { id: /^[a-f0-9]{12}$/.test(it.id) ? it.id : rid() };
    for (const f of fields) o[f] = str(it[f], 5000);
    if ('size' in o && !SIZES.includes(o.size)) o.size = '';
    return o;
  };
  function normalizeSections(list) {
    const out = [];
    for (const s of Array.isArray(list) ? list : []) {
      const d = SECTIONS.find((x) => x.key === s?.key);
      if (!d || out.some((x) => x.key === s.key)) continue;
      out.push({ key: s.key, emoji: str(s.emoji, 8), title: str(s.title, 120) || d.title, subtitle: str(s.subtitle, 300), nav: str(s.nav, 40) || d.nav, visible: s.visible !== false, size: SIZES.includes(s.size) ? s.size : d.size });
    }
    for (const d of SECTIONS) if (!out.some((x) => x.key === d.key)) out.push({ ...d });
    return out;
  }
  function makeUsername(email) {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user';
    let u = base;
    for (let n = 2; db.users.some((x) => x.username === u); n++) u = `${base}${n}`;
    return u;
  }
  const nameFromEmail = (e) => e.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

  // ---------- الطقس (Open-Meteo مباشرة من المتصفح) ----------
  async function getWeather() {
    const w = db.weather;
    if (!w.enabled) return null;
    const key = `${w.lat},${w.lon}`;
    let cache = null;
    try { cache = JSON.parse(ls.get(WKEY)); } catch { /* تجاهل */ }
    if (cache && cache.key === key && Date.now() - cache.at < 30 * 6e4) return { ...cache.data, city: w.city };
    const q = new URLSearchParams({
      latitude: w.lat, longitude: w.lon, timezone: 'auto', forecast_days: 7,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    });
    try {
      const r = await realFetch(`${WEATHER_API}/v1/forecast?${q}`);
      const j = await r.json();
      const data = {
        city: w.city,
        current: { temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature), humidity: j.current.relative_humidity_2m, wind: Math.round(j.current.wind_speed_10m), code: j.current.weather_code },
        days: j.daily.time.map((date, i) => ({ date, code: j.daily.weather_code[i], max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]) })),
      };
      ls.set(WKEY, JSON.stringify({ key, at: Date.now(), data }));
      return data;
    } catch {
      return cache && cache.key === key ? cache.data : null; // بدون إنترنت: آخر قراءة أو لا شيء
    }
  }

  function publicState(user) {
    const counts = { home: 0, draw: 0, away: 0 };
    for (const c of Object.values(db.poll.votes)) if (c in counts) counts[c]++;
    const likes = {};
    for (const [t, arr] of Object.entries(db.likes)) likes[t] = { count: arr.length, mine: arr.includes(user.id) };
    const { accepted, answers, ...quiz } = db.quiz;
    return {
      me: { id: user.id, name: user.name, username: user.username, isAdmin: !!user.isAdmin },
      issue: db.issue, sections: db.sections, weatherCity: db.weather.enabled ? db.weather.city : null,
      matches: db.matches, poll: { ...db.poll, votes: undefined, counts, myVote: db.poll.votes[user.id] || null },
      recommendations: db.recommendations, creative: db.creative, selfdev: db.selfdev, occasions: db.occasions,
      quiz: { ...quiz, answersCount: answers.length, answered: answers.some((a) => a.userId === user.id), accepted: quiz.closed ? accepted : undefined },
      photos: db.photos.filter((p) => p.approved || p.id === db.featuredPhotoId).map(({ userId: _, ...p }) => p),
      featuredPhotoId: db.featuredPhotoId, likes,
      comments: db.comments.map(({ userId, ...c }) => ({ ...c, mine: userId === user.id })),
    };
  }

  // ---------- المسارات (نفس منطق server.js) ----------
  async function route(m, p, body) {
    await ready();
    if (m === 'POST' && p === '/api/login') {
      const login = str(body.username, 200).toLowerCase();
      const u = db.users.find((x) => x.username === login || (x.email && x.email.toLowerCase() === login));
      need(u && await checkPassword(String(body.password || ''), u.pass), 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);
      u.lastLogin = now(); save(); ls.set(SKEY, u.id);
      return { ok: true, isAdmin: !!u.isAdmin };
    }
    if (m === 'POST' && p === '/api/logout') { ls.del(SKEY); return { ok: true }; }
    if (m === 'GET' && p === '/api/brand') { const { title, orgName, orgNameEn, logo } = db.issue; return { title, orgName, orgNameEn, logo }; }

    const user = db.users.find((u) => u.id === ls.get(SKEY));
    need(user, 'سجّل دخولك أولاً', 401);

    if (m === 'GET' && p === '/api/state') return publicState(user);
    if (m === 'GET' && p === '/api/weather') return { weather: await getWeather() };

    if (m === 'POST' && p === '/api/me/password') {
      need(await checkPassword(String(body.current || ''), user.pass), 'كلمة المرور الحالية غير صحيحة');
      need(String(body.next || '').length >= 8, 'كلمة المرور الجديدة لازم تكون 8 أحرف أو أكثر');
      user.pass = await hashPassword(String(body.next)); save(); return { ok: true };
    }
    if (m === 'POST' && p === '/api/poll/vote') {
      need(db.poll.home && db.poll.away, 'ما فيه استطلاع حالياً');
      need(!db.poll.closed, 'الاستطلاع مقفل');
      need(['home', 'draw', 'away'].includes(body.choice) && (body.choice !== 'draw' || db.poll.allowDraw), 'اختيار غير صالح');
      db.poll.votes[user.id] = body.choice; save(); broadcast(); return { ok: true };
    }
    if (m === 'POST' && p === '/api/like') {
      const t = str(body.targetId, 64); need(t, 'العنصر غير موجود');
      const arr = db.likes[t] || (db.likes[t] = []);
      const i = arr.indexOf(user.id);
      if (i >= 0) arr.splice(i, 1); else arr.push(user.id);
      save(); broadcast(); return { ok: true };
    }
    if (m === 'POST' && p === '/api/comments') {
      const c = { id: rid(), targetId: str(body.targetId, 64), userId: user.id, name: user.name, text: str(body.text, 1000), createdAt: now() };
      need(c.targetId && c.text, 'اكتب تعليقك');
      db.comments.push(c); save(); broadcast(); return { ok: true };
    }
    let mm = /^\/api\/comments\/(\w+)$/.exec(p);
    if (m === 'DELETE' && mm) {
      const c = db.comments.find((x) => x.id === mm[1]);
      need(c && (c.userId === user.id || user.isAdmin), 'ما تقدر تحذف هذا التعليق', 403);
      db.comments = db.comments.filter((x) => x !== c); save(); broadcast(); return { ok: true };
    }
    if (m === 'POST' && p === '/api/quiz/answer') {
      need(db.quiz.question, 'ما فيه مسابقة حالياً');
      need(!db.quiz.closed, 'المسابقة انتهت، انتظرونا العدد الجاي');
      need(!db.quiz.answers.some((a) => a.userId === user.id), 'شاركت من قبل، بالتوفيق!');
      const a = { id: rid(), userId: user.id, name: user.name, dept: str(body.dept, 60), answer: str(body.answer, 200), createdAt: now() };
      need(a.answer, 'اكتب إجابتك');
      db.quiz.answers.push(a); save(); broadcast(); return { ok: true };
    }
    if (m === 'POST' && p === '/api/photos') {
      need(/^data:image\/(png|jpeg|webp);base64,/.test(body.image || ''), 'الصورة لازم تكون PNG أو JPG أو WEBP');
      db.photos.push({ id: rid(), userId: user.id, name: user.name, caption: str(body.caption, 200), url: body.image, approved: false, createdAt: now() });
      try { save(); } catch (e) { db.photos.pop(); throw e; }
      broadcast(); return { ok: true };
    }
    if (m === 'POST' && p === '/api/suggestions') {
      const s = { id: rid(), name: body.anonymous ? '' : user.name, type: str(body.type, 40), text: str(body.text, 3000), link: str(body.link, 500), createdAt: now(), done: false };
      need(s.text, 'اكتب مشاركتك أو اقتراحك');
      db.suggestions.push(s); save(); broadcast(); return { ok: true };
    }

    if (p.startsWith('/api/admin/')) {
      need(user.isAdmin, 'هذي الصفحة لفريق النشرة فقط', 403);
      if (m === 'GET' && p === '/api/admin/data') return { suggestions: db.suggestions, quiz: db.quiz, photos: db.photos, poll: db.poll, weather: db.weather };
      mm = /^\/api\/admin\/section\/(\w+)$/.exec(p);
      if (m === 'PUT' && mm) {
        const key = mm[1];
        if (LIST[key]) { need(Array.isArray(body.items), 'بيانات غير صالحة'); db[key] = body.items.slice(0, 50).map((it) => cleanItem(LIST[key], it || {})); }
        else if (key === 'issue') {
          for (const f of ['title', 'greeting', 'dateFrom', 'dateTo', 'quote', 'footer', 'orgName', 'orgNameEn']) db.issue[f] = str(body[f], 1000);
          const site = str(body.siteUrl, 300).replace(/\/+$/, '');
          need(!site || /^https?:\/\/\S+$/.test(site), 'رابط المنصة لازم يبدأ بـ http:// أو https://');
          db.issue.siteUrl = site; db.issue.number = Math.max(1, parseInt(body.number, 10) || 1);
        } else if (key === 'sections') db.sections = normalizeSections(body.sections);
        else if (key === 'weather') {
          const city = str(body.city, 80);
          need(city, 'اكتب اسم المدينة');
          if (city !== db.weather.city) {
            let place = null;
            try {
              const r = await realFetch(`${GEO_API}/v1/search?${new URLSearchParams({ name: city, count: 1, language: 'ar' })}`);
              place = (await r.json()).results?.[0];
            } catch { need(false, 'تعذّر الاتصال بخدمة الطقس، تأكد من الإنترنت'); }
            need(place, 'ما لقينا هالمدينة، جرّب اسم ثاني (بالعربي أو الإنجليزي)');
            Object.assign(db.weather, { city, lat: place.latitude, lon: place.longitude });
          }
          db.weather.enabled = !!body.enabled;
        } else if (key === 'poll') {
          const changed = str(body.home) !== db.poll.home || str(body.away) !== db.poll.away;
          Object.assign(db.poll, { question: str(body.question, 300), home: str(body.home, 80), away: str(body.away, 80), allowDraw: !!body.allowDraw, closed: !!body.closed });
          if (changed || body.reset) { db.poll.votes = {}; db.poll.id = rid(); }
        } else if (key === 'quiz') {
          Object.assign(db.quiz, {
            question: str(body.question, 1000), hint: str(body.hint, 300), prize: str(body.prize, 200), closed: !!body.closed,
            accepted: String(body.accepted || '').split(/[,،\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
          });
          if (body.reset) Object.assign(db.quiz, { id: rid(), answers: [], winner: null, closed: false });
        } else need(false, 'قسم غير معروف');
        save(); broadcast(); return { ok: true };
      }
      if (m === 'POST' && p === '/api/admin/logo') {
        need(!body.image || /^data:image\/(png|jpeg|webp);base64,/.test(body.image), 'الصورة لازم تكون PNG أو JPG أو WEBP');
        db.issue.logo = body.reset ? DEFAULT_LOGO : body.image || '';
        db.issue.logoRemoved = !db.issue.logo;
        save(); broadcast(); return { logo: db.issue.logo };
      }
      if (m === 'POST' && p === '/api/admin/quiz/draw') {
        const ok = new Set(db.quiz.accepted.map(normalizeArabic));
        const pool = db.quiz.answers.filter((a) => ok.has(normalizeArabic(a.answer)));
        need(pool.length, 'ما فيه إجابات صحيحة للسحب');
        const w = pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
        db.quiz.winner = { name: w.name, dept: w.dept, correctCount: pool.length, drawnAt: now() }; db.quiz.closed = true;
        save(); broadcast(); return { winner: db.quiz.winner };
      }
      mm = /^\/api\/admin\/photos\/(\w+)\/(approve|feature|delete)$/.exec(p);
      if (m === 'POST' && mm) {
        const ph = db.photos.find((x) => x.id === mm[1]); need(ph, 'الصورة غير موجودة');
        if (mm[2] === 'approve') ph.approved = !ph.approved;
        if (mm[2] === 'feature') { db.featuredPhotoId = db.featuredPhotoId === ph.id ? null : ph.id; ph.approved = true; }
        if (mm[2] === 'delete') { db.photos = db.photos.filter((x) => x !== ph); if (db.featuredPhotoId === ph.id) db.featuredPhotoId = null; }
        save(); broadcast(); return { ok: true };
      }
      mm = /^\/api\/admin\/suggestions\/(\w+)$/.exec(p);
      if (mm && (m === 'POST' || m === 'DELETE')) {
        if (m === 'DELETE') db.suggestions = db.suggestions.filter((s) => s.id !== mm[1]);
        else { const s = db.suggestions.find((x) => x.id === mm[1]); if (s) s.done = !s.done; }
        save(); broadcast(); return { ok: true };
      }
      if (m === 'GET' && p === '/api/admin/users') return { users: db.users.map(publicUser) };
      if (m === 'POST' && p === '/api/admin/users/import') {
        const created = []; const skipped = [];
        for (const line of String(body.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3000)) {
          const parts = line.split(/[\t,،;]+/).map((x) => x.trim().replace(/^<|>$/g, '')).filter(Boolean);
          const email = parts.find((x) => EMAIL_RE.test(x))?.toLowerCase();
          if (!email) { skipped.push({ line, reason: 'ما فيه إيميل صحيح' }); continue; }
          if (db.users.some((u) => u.email === email)) { skipped.push({ line, reason: 'الحساب موجود من قبل' }); continue; }
          const name = str(parts.filter((x) => x.toLowerCase() !== email).join(' '), 80) || nameFromEmail(email);
          const password = makePassword();
          const u = { id: rid(), name, email, username: makeUsername(email), pass: await hashPassword(password), isAdmin: false, createdAt: now() };
          db.users.push(u); created.push({ name, email, username: u.username, password });
        }
        save(); return { created, skipped };
      }
      mm = /^\/api\/admin\/users\/(\w+)(\/reset)?$/.exec(p);
      if (mm) {
        const t = db.users.find((u) => u.id === mm[1]); need(t, 'الحساب غير موجود', 404);
        if (m === 'POST' && mm[2]) {
          const password = makePassword();
          t.pass = await hashPassword(password); save();
          return { name: t.name, email: t.email, username: t.username, password };
        }
        if (m === 'PUT') {
          need(str(body.name, 80), 'اكتب اسم صاحب الحساب');
          need(body.isAdmin || !t.isAdmin || db.users.filter((u) => u.isAdmin).length > 1, 'لازم يبقى مدير واحد على الأقل');
          t.name = str(body.name, 80); t.isAdmin = !!body.isAdmin; save(); broadcast(); return { ok: true };
        }
        if (m === 'DELETE') {
          need(t.id !== user.id, 'ما تقدر تحذف حسابك وأنت داخل فيه');
          need(!t.isAdmin || db.users.filter((u) => u.isAdmin).length > 1, 'لازم يبقى مدير واحد على الأقل');
          db.users = db.users.filter((u) => u !== t); save(); return { ok: true };
        }
      }
    }
    throw err(404, 'غير موجود');
  }

  // ---------- وضع التشغيل ----------
  // إذا الملف مفتوح من خادم المنصة (server.js) نستخدم بياناته المشتركة،
  // وإذا مفتوح كملف من الجهاز أو من استضافة عادية نشتغل محلياً في المتصفح.
  let MODE = null;
  let modeCheck = null;
  function detectMode() {
    if (!modeCheck) {
      modeCheck = (async () => {
        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const r = await realFetch('/api/brand', { cache: 'no-store' });
            if (r.ok && r.headers.get('X-Weekend-Saeed')) return 'server';
          } catch { /* ما فيه خادم */ }
        }
        return 'local';
      })().then((m) => { MODE = m; document.documentElement.dataset.mode = m; return m; });
    }
    return modeCheck;
  }

  // نعترض طلبات /api/ ونجاوبها من هنا (أو نمررها للخادم)، وباقي الطلبات مثل الطقس تروح للإنترنت عادي
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const i = url.pathname.indexOf('/api/');
    if (i < 0 || url.origin !== location.origin) return realFetch(input, init);
    if ((await detectMode()) === 'server') return realFetch(input, init);
    let status = 200; let data;
    try { data = await route((init.method || 'GET').toUpperCase(), url.pathname.slice(i), init.body ? JSON.parse(init.body) : {}); }
    catch (e) { status = e.status || 500; data = { error: e.status ? e.message : 'صار خطأ، جرّب مرة ثانية' }; if (!e.status) console.error(e); }
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
})();
