// ويكند سعيد — صفحة الموظفين
'use strict';

let state = null;
const openComments = new Set();
const drafts = {};
const $ = (s, el = document) => el.querySelector(s);


// ---------- التفاعل: إعجاب + تعليقات ----------

function interact(targetId) {
  const lk = state.likes[targetId] || { count: 0, mine: false };
  const cs = state.comments.filter((c) => c.targetId === targetId);
  const open = openComments.has(targetId);
  return `
  <div class="interact" data-target="${esc(targetId)}">
    <div class="interact-bar">
      <button class="pill like ${lk.mine ? 'on' : ''}" data-act="like" aria-pressed="${lk.mine}">${lk.mine ? '❤️' : '🤍'} ${lk.count || ''} عجبني</button>
      <button class="pill" data-act="toggle-comments" aria-expanded="${open}">💬 ${cs.length || ''} تعليق</button>
    </div>
    ${open ? `
    <div class="comments">
      ${cs.map((c) => `<div class="comment"><b>${esc(c.name)}</b> <span class="muted">${timeAgo(c.createdAt)}</span>
        ${c.mine || state.me.isAdmin ? `<button class="link-btn small" data-act="del-comment" data-id="${esc(c.id)}">حذف</button>` : ''}<p>${esc(c.text)}</p></div>`).join('') || '<p class="muted small">كن أول من يعلّق 👀</p>'}
      <form class="comment-form" data-act="comment">
        <input name="text" placeholder="اكتب تعليقك…" maxlength="1000" required value="${esc(drafts[targetId] || '')}" data-draft="${esc(targetId)}">
        <button class="btn sm">نشر</button>
      </form>
    </div>` : ''}
  </div>`;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.tagName === 'FORM') return;
  const target = btn.closest('[data-target]')?.dataset.target;
  const act = btn.dataset.act;
  try {
    if (act === 'like') { await api('/api/like', { method: 'POST', body: { targetId: target } }); await refresh(); }
    if (act === 'toggle-comments') {
      openComments.has(target) ? openComments.delete(target) : openComments.add(target);
      render();
      if (openComments.has(target)) $(`[data-draft="${CSS.escape(target)}"]`)?.focus();
    }
    if (act === 'vote') { await api('/api/poll/vote', { method: 'POST', body: { choice: btn.dataset.choice } }); toast('تم تسجيل توقعك 👌'); await refresh(); }
    if (act === 'expand') { btn.closest('.creative-item').classList.toggle('expanded'); }
    if (act === 'del-comment' && confirm('تحذف التعليق؟')) { await api(`/api/comments/${btn.dataset.id}`, { method: 'DELETE' }); await refresh(); }
  } catch (err) { toast(err.message, true); }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.draft) drafts[e.target.dataset.draft] = e.target.value;
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.dataset.act !== 'comment') return;
  e.preventDefault();
  const targetId = f.closest('[data-target]').dataset.target;
  const fd = new FormData(f);
  try {
    await api('/api/comments', { method: 'POST', body: { targetId, text: fd.get('text') } });
    delete drafts[targetId];
    await refresh();
  } catch (err) { toast(err.message, true); }
});

// ---------- الأقسام ----------

function renderIssue() {
  const i = state.issue;
  document.title = i.title || 'ويكند سعيد';
  $('#issue-title').textContent = i.title || 'ويكند سعيد';
  $('#issue-no').textContent = arNum(i.number);
  $('#issue-greeting').textContent = i.greeting;
  const d = [fmtDate(i.dateFrom), fmtDate(i.dateTo)].filter(Boolean).join(' – ');
  $('#issue-dates').textContent = d ? ` · ${d}` : '';
  renderBrand(i);
  $('#issue-quote').textContent = i.quote ? `“${i.quote}”` : '';
  $('#issue-footer').textContent = i.footer || '';
  $('#hello').textContent = `هلا ${state.me.name} 👋`;
  $('#admin-link').hidden = !state.me.isAdmin;
}

// عناوين الأقسام وترتيبها وإظهارها من إعدادات الإدارة
function renderSections() {
  const main = $('main');
  const nav = [];
  for (const s of state.sections) {
    const el = document.getElementById(s.key);
    if (!el) continue;
    main.appendChild(el);
    el.dataset.acc = String(state.sections.indexOf(s) % 6);
    const empty = s.key === 'occasions' && !state.occasions.length;
    el.hidden = !s.visible || empty;
    $('.sec-head h2', el).textContent = [s.emoji, s.title].filter(Boolean).join(' ');
    $('.sec-head p', el).textContent = s.subtitle;
    if (!el.hidden) nav.push(`<a href="#${s.key}">${esc([s.emoji, s.nav].filter(Boolean).join(' '))}</a>`);
  }
  $('#nav').innerHTML = nav.join('');
}

function renderOccasions() {
  const list = state.occasions;
  $('#occasions-list').innerHTML = list.map((o) => {
    const [ic, t] = label('occasion', o.type);
    return `<div class="occasion"><span class="oc-ic">${ic}</span><div><b>${esc(t)} ${esc(o.person)}</b><p>${esc(o.text)}</p></div></div>`;
  }).join('');
}

function renderMatches() {
  $('#matches-list').innerHTML = state.matches.map((m) => `
    <article class="card match">
      <div class="match-top"><span class="league">${esc(m.league)}</span><span class="day">${esc(m.day)} · ${esc(m.time)}</span></div>
      <div class="teams"><span>${esc(m.home)}</span><span class="vs">VS</span><span>${esc(m.away)}</span></div>
      <div class="match-meta">${m.stadium ? `🏟️ ${esc(m.stadium)}` : ''} ${m.channel ? `<span>📺 ${esc(m.channel)}</span>` : ''}</div>
      ${interact(m.id)}
    </article>`).join('') || '<p class="card empty">⚽ مباريات الويكند تنزل قريب… جهّز القهوة!</p>';
}

function renderPoll() {
  const p = state.poll;
  if (!p.home || !p.away) { $('#poll-box').innerHTML = '<p class="empty" style="padding:24px 8px">🔮 استطلاع التوقعات ينزل مع مباريات الويكند… خلّك جاهز!</p>'; return; }
  const c = p.counts;
  const total = c.home + c.away + c.draw;
  const voted = !!p.myVote;
  const showResults = voted || p.closed;
  const opts = [['home', p.home], ...(p.allowDraw ? [['draw', 'تعادل 🤝']] : []), ['away', p.away]];
  $('#poll-box').innerHTML = `
    <h3>${esc(p.question)}</h3>
    <div class="poll-opts">
      ${opts.map(([k, name]) => {
        const pct = total ? Math.round((c[k] / total) * 100) : 0;
        return `<button class="poll-opt ${p.myVote === k ? 'mine' : ''}" data-act="vote" data-choice="${k}" ${p.closed ? 'disabled' : ''}>
          <span class="bar" style="width:${showResults ? pct : 0}%"></span>
          <span class="opt-name">${esc(name)} ${p.myVote === k ? '✓' : ''}</span>
          ${showResults ? `<span class="opt-pct">${pct}% <small>(${c[k]})</small></span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <p class="muted small">${p.closed ? '🔒 التصويت انتهى' : voted ? 'تقدر تغيّر رأيك قبل ما يقفل التصويت' : 'اضغط على توقعك عشان تشوف النتيجة'} · ${total} مشارك</p>
    ${interact(p.id)}`;
}

function qr(el, text) {
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    el.innerHTML = q.createSvgTag(3, 2);
  } catch { el.remove(); }
}

function renderRecs() {
  $('#recs-list').innerHTML = state.recommendations.map((r) => {
    const [ic, cat] = label('rec', r.category);
    const link = safeUrl(r.link);
    const isBook = r.category === 'book';
    return `
    <article class="card rec cat-${esc(r.category)}">
      <div class="rec-head"><span class="rec-ic">${ic}</span><div>
        <span class="tag">${esc(cat)}</span>
        <h3>${esc(r.title || cat)} ${isBook ? 'ينصح فيه' : 'برأي'} زميلنا <span class="who">${esc(r.colleague)}</span></h3>
      </div></div>
      <h4>${esc(r.itemName)}</h4>
      <p>${esc(r.description)}</p>
      ${r.location ? `<p class="muted small">📍 ${esc(r.location)}</p>` : ''}
      ${link ? `<div class="rec-link">
        <a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">${isBook ? '📥 تحميل / قراءة الكتاب' : '🔗 الرابط'}</a>
        ${isBook ? `<div class="qr" data-qr="${esc(link)}" title="امسح الكود من جوالك"></div>` : ''}</div>` : ''}
      ${interact(r.id)}
    </article>`;
  }).join('') || '<p class="card empty">💡 ما فيه توصيات للحين، كن أول من يشاركنا وحدة من الصندوق تحت 👇</p>';
  document.querySelectorAll('#recs-list [data-qr]').forEach((el) => qr(el, el.dataset.qr));
}

function renderLens() {
  const f = state.photos.find((p) => p.id === state.featuredPhotoId);
  $('#lens-featured').innerHTML = f ? `
    <figure class="card featured">
      <img src="${esc(f.url)}" alt="${esc(f.caption || 'صورة الويكند')}" loading="lazy">
      <figcaption><span class="tag gold">🏆 صورة العدد</span> <b>بعدسة ${esc(f.name)}</b>${f.caption ? ` — ${esc(f.caption)}` : ''}</figcaption>
      ${interact(f.id)}
    </figure>` : '<div class="card empty">📷 صورة العدد تنزل هنا… يمكن تكون صورتك!</div>';
  const others = state.photos.filter((p) => p.id !== state.featuredPhotoId);
  $('#lens-gallery').innerHTML = others.map((p) => `
    <figure class="card shot">
      <img src="${esc(p.url)}" alt="${esc(p.caption || 'صورة')}" loading="lazy">
      <figcaption><b>${esc(p.name)}</b>${p.caption ? ` — ${esc(p.caption)}` : ''}</figcaption>
      ${interact(p.id)}
    </figure>`).join('');
}

function renderCreative() {
  $('#creative-list').innerHTML = state.creative.map((c) => {
    const [ic, t] = label('creative', c.type);
    const link = safeUrl(c.link);
    const long = c.body.length > 280;
    return `
    <article class="card creative-item type-${esc(c.type)}">
      <div class="rec-head"><span class="rec-ic">${ic}</span><div>
        <span class="tag">${esc(t)}</span>
        <h3>${esc(c.title)}</h3>
        <p class="muted small">بقلم وصوت زميلنا <b>${esc(c.author)}</b></p>
      </div></div>
      ${c.body ? `<div class="body ${c.type === 'poem' ? 'poem' : ''} ${long ? 'clamp' : ''}">${esc(c.body)}</div>` : ''}
      ${long ? '<button class="link-btn" data-act="expand">اقرأ أكثر / أقل</button>' : ''}
      ${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">${c.type === 'podcast' ? '🎧 استمع' : '🔗 افتح'}</a>` : ''}
      ${interact(c.id)}
    </article>`;
  }).join('') || '<p class="card empty">✍️ عندك مقالة أو بودكاست أو قصيدة؟ أرسلها لنا من الصندوق تحت</p>';
}

function renderSelfdev() {
  $('#selfdev-list').innerHTML = state.selfdev.map((s) => {
    const link = safeUrl(s.link);
    return `
    <article class="card selfdev">
      <h3>🌱 ${esc(s.title)}</h3>
      <p>${esc(s.summary)}</p>
      <p class="muted small">${s.source ? `✍️ ${esc(s.source)}` : ''} ${s.readMinutes ? ` · ⏱️ ${esc(s.readMinutes)} دقائق قراءة` : ''}</p>
      ${link ? `<a class="btn sm ghost" href="${esc(link)}" target="_blank" rel="noopener">كمّل القراءة</a>` : ''}
      ${interact(s.id)}
    </article>`;
  }).join('') || '<p class="card empty">🌱 قريباً… وإذا عندك مقالة نفعتك شاركنا فيها من الصندوق تحت</p>';
}

let quizKey = '';
function renderQuiz() {
  const q = state.quiz;
  if (!q.question) {
    $('#quiz-interact').innerHTML = '';
    quizKey = '';
    $('#quiz-main').innerHTML = '<p class="empty" style="padding:24px 8px">🧩 سؤال الويكند ينزل قريب… جهّز عقلك! وعندك سؤال حلو؟ أرسله من الصندوق تحت.</p>';
    return;
  }
  // لا نعيد رسم النموذج إذا ما تغيّر شي، عشان ما يضيع اللي كتبه الموظف
  const key = JSON.stringify([q.id, q.question, q.hint, q.prize, q.closed, q.answered, q.winner, q.answersCount, q.accepted]);
  $('#quiz-interact').innerHTML = interact(q.id);
  if (key === quizKey) return;
  quizKey = key;
  const pageUrl = (state.issue.siteUrl || location.origin) + '/#quiz';
  $('#quiz-main').innerHTML = `
    <div class="quiz-q">
      <div>
        <p class="quiz-label">سؤال الأسبوع</p>
        <h3>${esc(q.question)}</h3>
        ${q.hint ? `<p class="muted">💡 تلميح: ${esc(q.hint)}</p>` : ''}
        <p>🎁 الجائزة: <b>${esc(q.prize)}</b> · 👥 ${q.answersCount} مشارك</p>
      </div>
      <div class="quiz-qr"><div class="qr" id="quiz-qr"></div><span class="muted small">امسح وجاوب من جوالك</span></div>
    </div>
    ${q.winner ? `<div class="winner">🎉 مبروك للفائز <b>${esc(q.winner.name)}</b>${q.winner.dept ? ` من ${esc(q.winner.dept)}` : ''}! تم السحب بين ${q.winner.correctCount} إجابة صحيحة.
      ${q.accepted ? `<br><span class="small">الإجابة الصحيحة: ${esc(q.accepted[0] || '')}</span>` : ''}</div>`
    : q.closed ? '<div class="winner soft">🔒 المسابقة انتهت، الفائز يُعلن قريب</div>'
    : q.answered ? '<div class="winner soft">✅ وصلتنا إجابتك، بالتوفيق في السحب!</div>'
    : `<form id="quiz-form" class="form row-form">
        <input name="dept" placeholder="إدارتك (اختياري)" maxlength="60">
        <input name="answer" placeholder="إجابتك" required maxlength="200">
        <button class="btn">أرسل الإجابة</button>
      </form>`}`;
  qr($('#quiz-qr'), pageUrl);
}

$('#quiz-box').addEventListener('submit', async (e) => {
  if (e.target.id !== 'quiz-form') return;
  e.preventDefault();
  try {
    await api('/api/quiz/answer', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    toast('وصلت إجابتك 🤞');
    await refresh();
  } catch (err) { toast(err.message, true); }
});

// ---------- النماذج الثابتة ----------

function formMsg(f, msg, bad) {
  const p = $('.form-msg', f);
  p.textContent = msg;
  p.classList.toggle('bad', !!bad);
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('اختر صورة'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // تصغير الصورة قبل الرفع عشان تكون خفيفة
      const max = 1600;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ما قدرنا نقرأ الصورة')); };
    img.src = url;
  });
}

$('#photo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = $('button', f);
  btn.disabled = true;
  try {
    const image = await readImage(f.image.files[0]);
    await api('/api/photos', { method: 'POST', body: { caption: f.caption.value, image } });
    f.caption.value = '';
    f.image.value = '';
    formMsg(f, 'شكراً! وصلت صورتك، وبتظهر بعد مراجعة فريق النشرة 📸');
  } catch (err) { formMsg(f, err.message, true); }
  btn.disabled = false;
});

$('#suggest-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/suggestions', { method: 'POST', body: { ...Object.fromEntries(new FormData(f)), anonymous: f.anonymous.checked } });
    f.text.value = '';
    f.link.value = '';
    formMsg(f, 'وصلت مشاركتك، شكراً لأنك جزء من النشرة 💛');
  } catch (err) { formMsg(f, err.message, true); }
});

// ---------- عدّاد الويكند ----------

function renderCountdown() {
  const el = $('#countdown');
  const d = new Date();
  const day = d.getDay(); // 5 = الجمعة، 6 = السبت
  const card = (num, label, sub) => `<b class="stat-num">${num}</b><span class="stat-label">${label}</span><small>${sub}</small>`;
  if (day === 5 || day === 6) { el.innerHTML = card('🌴', 'الويكند بدأ!', 'استمتع وارتاح، وشوفنا الأحد بطاقة'); return; }
  const end = new Date(d);
  end.setDate(d.getDate() + ((4 - day + 7) % 7));
  end.setHours(16, 0, 0, 0); // الخميس الساعة 4 العصر
  if (end <= d) { el.innerHTML = card('🎉', 'خلص الدوام!', 'ويكند سعيد'); return; }
  const ms = end - d;
  const dd = Math.floor(ms / 864e5), hh = Math.floor((ms % 864e5) / 36e5), mm = Math.floor((ms % 36e5) / 6e4);
  el.innerHTML = dd
    ? card(arNum(dd), dd === 1 ? 'يوم على الويكند' : 'أيام على الويكند', `و ${arNum(hh)} ساعة · نهاية الدوام الخميس`)
    : card(`${arNum(hh)}:${arNum(String(mm).padStart(2, '0'))}`, 'ساعة على الويكند', 'نهاية الدوام الخميس ٤ العصر');
}

// ---------- الهوية والوقت والتاريخ ----------

function renderBrand(i) {
  $('#org-name').textContent = i.orgName || '';
  $('#org-name-en').textContent = i.orgNameEn || '';
  const logo = $('#org-logo');
  logo.hidden = !i.logo;
  if (i.logo && logo.getAttribute('src') !== i.logo) logo.src = i.logo;
}

const TZ = 'Asia/Riyadh';
function renderClock() {
  const d = new Date();
  $('#today-name').textContent = d.toLocaleDateString('ar-SA', { weekday: 'long', timeZone: TZ });
  $('#today').textContent = d.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  $('#today-hijri').textContent = d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  $('#clock').textContent = d.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
renderClock();
setInterval(renderClock, 15000);

renderCountdown();
setInterval(renderCountdown, 30000);

// ---------- التحميل والتحديث الحي ----------

function render() {
  // نحافظ على مكان المؤشر لو الموظف يكتب تعليق
  const a = document.activeElement;
  const focusDraft = a?.dataset?.draft;
  const sel = focusDraft ? [a.selectionStart, a.selectionEnd] : null;

  renderIssue(); renderSections(); renderOccasions(); renderMatches(); renderPoll(); renderRecs();
  renderLens(); renderCreative(); renderSelfdev(); renderQuiz();

  if (focusDraft) {
    const el = $(`[data-draft="${CSS.escape(focusDraft)}"]`);
    if (el) { el.focus(); el.setSelectionRange(...sel); }
  }
}

async function refresh() {
  try {
    const prevCity = state?.weatherCity;
    state = await api('/api/state');
    render();
    document.body.classList.remove('loading');
    if (state.weatherCity !== prevCity) loadWeather();
  } catch (err) { toast(err.message, true); }
}

// ---------- الطقس ----------

async function loadWeather() {
  const cards = ['#weather', '#w-fri', '#w-sat'].map((x) => $(x));
  const hide = () => cards.forEach((c) => { c.hidden = true; });
  if (!state.weatherCity) return hide();
  try {
    const { weather: w } = await api('/api/weather');
    if (!w) return hide();
    const [ic, txt] = weatherInfo(w.current.code);
    cards[0].innerHTML = `<b class="stat-num">${arNum(w.current.temp)}°</b><span class="stat-label">${ic} ${esc(w.city)} الآن · ${txt}</span>
      <small>المحسوسة ${arNum(w.current.feels)}° · رطوبة ${arNum(w.current.humidity)}٪ · رياح ${arNum(w.current.wind)} كم/س</small>`;
    // توقعات الجمعة والسبت الجايين
    for (const [n, card] of [[5, cards[1]], [6, cards[2]]]) {
      const day = w.days.find((x) => new Date(x.date + 'T12:00:00').getDay() === n);
      card.hidden = !day;
      if (!day) continue;
      const [dic, dtxt] = weatherInfo(day.code);
      card.innerHTML = `<b class="stat-num">${arNum(day.max)}°</b><span class="stat-label">${dic} ${n === 5 ? 'الجمعة' : 'السبت'} · ${dtxt}</span>
        <small>الصغرى ${arNum(day.min)}° · العظمى ${arNum(day.max)}°</small>`;
    }
    cards[0].hidden = false;
  } catch { hide(); }
}
setInterval(() => { if (state) loadWeather(); }, 30 * 6e4);

// ---------- تغيير كلمة المرور ----------

$('#pw-open').onclick = () => $('#pw-dialog').showModal();
$('#pw-close').onclick = () => $('#pw-dialog').close();
$('#pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.next.value !== f.confirm.value) return formMsg(f, 'كلمتين المرور الجديدة مو متطابقة', true);
  try {
    await api('/api/me/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } });
    f.reset();
    formMsg(f, '');
    $('#pw-dialog').close();
    toast('تم تغيير كلمة المرور ✅');
  } catch (err) { formMsg(f, err.message, true); }
});

let pending;
function connect() {
  const es = new EventSource('/api/events');
  es.onmessage = () => { clearTimeout(pending); pending = setTimeout(refresh, 150); };
}

window.addEventListener('load', async () => {
  await refresh();
  connect();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
