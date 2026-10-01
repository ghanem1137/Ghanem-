// ويكند سعيد — صفحة الموظفين
'use strict';

let state = null;
const openComments = new Set();
const drafts = {};
const $ = (s, el = document) => el.querySelector(s);

// الاسم يتذكره المتصفح عشان ما تكتبه كل مرة
const savedName = () => store.get('wk-name') || '';
document.querySelectorAll('.js-name').forEach((i) => { i.value = savedName(); });

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
      ${cs.map((c) => `<div class="comment"><b>${esc(c.name)}</b> <span class="muted">${timeAgo(c.createdAt)}</span><p>${esc(c.text)}</p></div>`).join('') || '<p class="muted small">كن أول من يعلّق 👀</p>'}
      <form class="comment-form" data-act="comment">
        <input name="name" placeholder="اسمك" maxlength="60" required value="${esc(savedName())}">
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
  } catch (err) { toast(err.message, true); }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.draft) drafts[e.target.dataset.draft] = e.target.value;
  if (e.target.name === 'name') {
    store.set('wk-name', e.target.value.trim());
    document.querySelectorAll('input[name=name]').forEach((i) => { if (i !== e.target && !i.value) i.value = e.target.value; });
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.dataset.act !== 'comment') return;
  e.preventDefault();
  const targetId = f.closest('[data-target]').dataset.target;
  const fd = new FormData(f);
  try {
    await api('/api/comments', { method: 'POST', body: { targetId, name: fd.get('name'), text: fd.get('text') } });
    delete drafts[targetId];
    await refresh();
  } catch (err) { toast(err.message, true); }
});

// ---------- الأقسام ----------

function renderIssue() {
  const i = state.issue;
  document.title = i.title || 'ويكند سعيد';
  $('#issue-title').textContent = i.title || 'ويكند سعيد';
  $('#issue-badge').textContent = `العدد ${i.number}`;
  $('#issue-greeting').textContent = i.greeting;
  const d = [fmtDate(i.dateFrom), fmtDate(i.dateTo)].filter(Boolean).join(' – ');
  $('#issue-dates').textContent = d;
  $('#issue-dates').hidden = !d;
  $('#issue-quote').textContent = i.quote ? `“${i.quote}”` : '';
}

function renderOccasions() {
  const list = state.occasions;
  $('#occasions-sec').hidden = !list.length;
  $('#occasions').innerHTML = list.map((o) => {
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
    </article>`).join('') || '<p class="muted">المباريات تنزل قريب…</p>';
}

function renderPoll() {
  const p = state.poll;
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
  }).join('') || '<p class="muted">ما فيه توصيات هالأسبوع، شاركنا وحدة من الصندوق تحت 👇</p>';
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
  }).join('') || '<p class="muted">عندك مقالة أو قصيدة؟ أرسلها لنا من الصندوق تحت ✍️</p>';
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
  }).join('');
}

let quizKey = '';
function renderQuiz() {
  const q = state.quiz;
  // لا نعيد رسم النموذج إذا ما تغيّر شي، عشان ما يضيع اللي كتبه الموظف
  const key = JSON.stringify([q.id, q.question, q.hint, q.prize, q.closed, q.answered, q.winner, q.answersCount, q.accepted]);
  $('#quiz-interact').innerHTML = interact(q.id);
  if (key === quizKey) return;
  quizKey = key;
  const pageUrl = location.origin + '/#quiz';
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
        <input name="name" placeholder="اسمك" required maxlength="60" value="${esc(savedName())}">
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
    await api('/api/photos', { method: 'POST', body: { name: f.name.value, caption: f.caption.value, image } });
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
    await api('/api/suggestions', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
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
  if (day === 5 || day === 6) { el.textContent = '🌴 الويكند بدأ! استمتع وارتاح، وشوفنا الأحد بطاقة'; return; }
  const end = new Date(d);
  end.setDate(d.getDate() + ((4 - day + 7) % 7));
  end.setHours(16, 0, 0, 0); // الخميس الساعة 4 العصر
  if (end <= d) { el.textContent = '🎉 خلص الدوام! ويكند سعيد'; return; }
  const ms = end - d;
  const dd = Math.floor(ms / 864e5), hh = Math.floor((ms % 864e5) / 36e5), mm = Math.floor((ms % 36e5) / 6e4);
  el.innerHTML = `⏳ باقي على الويكند: ${dd ? `<b>${dd}</b> يوم ` : ''}<b>${hh}</b> ساعة <b>${mm}</b> دقيقة`;
}
renderCountdown();
setInterval(renderCountdown, 30000);

// ---------- التحميل والتحديث الحي ----------

function render() {
  // نحافظ على مكان المؤشر لو الموظف يكتب تعليق
  const a = document.activeElement;
  const focusDraft = a?.dataset?.draft;
  const sel = focusDraft ? [a.selectionStart, a.selectionEnd] : null;

  renderIssue(); renderOccasions(); renderMatches(); renderPoll(); renderRecs();
  renderLens(); renderCreative(); renderSelfdev(); renderQuiz();

  if (focusDraft) {
    const el = $(`[data-draft="${CSS.escape(focusDraft)}"]`);
    if (el) { el.focus(); el.setSelectionRange(...sel); }
  }
}

async function refresh() {
  try {
    state = await api('/api/state');
    render();
  } catch (err) { toast(err.message, true); }
}

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
