// ويكند سعيد — لوحة فريق النشرة
'use strict';

const $ = (s, el = document) => el.querySelector(s);
let token = store.get('wk-admin') || '';
let pub = null;   // الحالة العامة
let priv = null;  // بيانات الإدارة (الاقتراحات، إجابات المسابقة، كل الصور)
let tab = 'issue';

const adminApi = (path, opts = {}) =>
  api(path, { ...opts, headers: { 'X-Admin-Token': token } }).catch((e) => {
    if (/سجّل دخول/.test(e.message)) showLogin();
    throw e;
  });

// ---------- تعريف الحقول ----------

const sel = (opts) => ({ type: 'select', opts });
const LIST_SCHEMAS = {
  matches: {
    label: 'مباراة', fields: {
      league: ['الدوري', 'text'], day: ['اليوم', sel({ 'الجمعة': 'الجمعة', 'السبت': 'السبت' })], time: ['الوقت', 'text'],
      home: ['الفريق الأول', 'text'], away: ['الفريق الثاني', 'text'], stadium: ['الملعب', 'text'], channel: ['القناة', 'text'],
    },
  },
  recommendations: {
    label: 'توصية', fields: {
      category: ['النوع', sel(Object.fromEntries(Object.entries(LABELS.rec).map(([k, v]) => [k, v.join(' ')])))],
      title: ['العنوان (مثل: قهوة الجمعة)', 'text'], colleague: ['اسم الزميل', 'text'], itemName: ['اسم المكان / الفيلم / الكتاب', 'text'],
      description: ['ليش ينصح فيه؟', 'textarea'], location: ['الموقع (اختياري)', 'text'], link: ['رابط أو رابط تحميل الكتاب (يطلع له QR)', 'url'],
    },
  },
  creative: {
    label: 'مشاركة', fields: {
      type: ['النوع', sel(Object.fromEntries(Object.entries(LABELS.creative).map(([k, v]) => [k, v.join(' ')])))],
      title: ['العنوان', 'text'], author: ['اسم الزميل', 'text'], body: ['النص (المقالة أو القصيدة أو نبذة عن الحلقة)', 'textarea'],
      link: ['رابط (للبودكاست أو المقالة الكاملة)', 'url'],
    },
  },
  selfdev: {
    label: 'مقالة', fields: {
      title: ['العنوان', 'text'], summary: ['الملخص', 'textarea'], source: ['الكاتب / المصدر', 'text'],
      readMinutes: ['مدة القراءة (دقائق)', 'number'], link: ['رابط المقالة', 'url'],
    },
  },
  occasions: {
    label: 'مناسبة', fields: {
      type: ['النوع', sel(Object.fromEntries(Object.entries(LABELS.occasion).map(([k, v]) => [k, v.join(' ')])))],
      person: ['اسم الزميل', 'text'], text: ['الرسالة', 'text'],
    },
  },
};

const TABS = {
  issue: '📰 العدد', matches: '⚽ المباريات', poll: '🔮 الاستطلاع', recommendations: '💡 التوصيات',
  lens: '📸 عدسة الموظف', creative: '✍️ الإبداع', selfdev: '🌱 تطوير الذات', occasions: '🎉 المناسبات',
  quiz: '🧩 المسابقة', box: '📮 الصندوق', comments: '💬 التعليقات',
};

// ---------- عناصر مساعدة ----------

function field(name, labelText, type, value) {
  if (type === 'textarea') return `<label>${esc(labelText)}<textarea name="${name}" rows="4">${esc(value)}</textarea></label>`;
  if (typeof type === 'object') {
    return `<label>${esc(labelText)}<select name="${name}">${Object.entries(type.opts).map(([k, v]) =>
      `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  }
  return `<label>${esc(labelText)}<input name="${name}" type="${type}" value="${esc(value)}" ${type === 'url' ? 'placeholder="https://"' : ''}></label>`;
}
const check = (name, labelText, on) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${esc(labelText)}</label>`;

// ---------- محرّر القوائم ----------

function listEditor(key) {
  const { label: lbl, fields } = LIST_SCHEMAS[key];
  const items = pub[key];
  const one = (it, i) => `
    <div class="item-editor" data-id="${esc(it.id || '')}">
      <div class="head"><b>${esc(lbl)} ${i + 1}</b>
        <div class="actions">
          <button type="button" class="pill" data-move="-1" title="لفوق">⬆️</button>
          <button type="button" class="pill" data-move="1" title="لتحت">⬇️</button>
          <button type="button" class="pill" data-remove>🗑️ حذف</button>
        </div></div>
      <div class="row">${Object.entries(fields).map(([f, [l, t]]) => field(f, l, t, it[f] ?? '')).join('')}</div>
    </div>`;
  return `
    <form class="form" id="list-form">
      <div class="editor-list">${items.map(one).join('') || '<p class="muted">ما فيه عناصر بعد.</p>'}</div>
      <div class="actions">
        <button type="button" class="btn ghost" id="add-item">➕ إضافة ${esc(lbl)}</button>
        <button class="btn">💾 حفظ ونشر</button>
      </div>
    </form>`;
}

function collectList(form) {
  return [...form.querySelectorAll('.item-editor')].map((el) => {
    const o = { id: el.dataset.id };
    el.querySelectorAll('[name]').forEach((i) => { o[i.name] = i.value; });
    return o;
  });
}

function bindList(key) {
  const form = $('#list-form');
  form.addEventListener('click', (e) => {
    const ed = e.target.closest('.item-editor');
    if (e.target.closest('[data-remove]') && confirm('متأكد من الحذف؟ (ما يُحذف نهائياً إلا بعد الحفظ)')) { ed.remove(); pub[key] = collectList(form); }
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const items = collectList(form);
      const i = [...form.querySelectorAll('.item-editor')].indexOf(ed);
      const j = i + Number(mv.dataset.move);
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      pub[key] = items;
      renderTab();
    }
  });
  $('#add-item').onclick = () => {
    pub[key] = [...collectList(form), {}];
    renderTab();
    [...document.querySelectorAll('.item-editor')].pop().scrollIntoView({ behavior: 'smooth' });
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await adminApi(`/api/admin/section/${key}`, { method: 'PUT', body: { items: collectList(form) } });
      toast('تم الحفظ والنشر ✅');
      await load();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- التبويبات ----------

const views = {
  issue() {
    const i = pub.issue;
    return `<form class="form" id="f">
      <div class="row">${field('number', 'رقم العدد', 'number', i.number)}${field('title', 'اسم النشرة', 'text', i.title)}
      ${field('dateFrom', 'من تاريخ', 'date', i.dateFrom)}${field('dateTo', 'إلى تاريخ', 'date', i.dateTo)}</div>
      ${field('greeting', 'كلمة الترحيب', 'textarea', i.greeting)}
      ${field('quote', 'اقتباس الأسبوع (يطلع في آخر الصفحة)', 'text', i.quote)}
      <button class="btn">💾 حفظ ونشر</button></form>`;
  },
  poll() {
    const p = priv.poll;
    const counts = { home: 0, draw: 0, away: 0 };
    Object.values(p.votes).forEach((v) => { counts[v]++; });
    return `<form class="form" id="f">
      ${field('question', 'السؤال', 'text', p.question)}
      <div class="row">${field('home', 'الخيار الأول (الفريق الأول)', 'text', p.home)}${field('away', 'الخيار الثاني (الفريق الثاني)', 'text', p.away)}</div>
      <p class="muted small">💡 اختر وحدة من المباريات: ${pub.matches.map((m) => `<button type="button" class="pill" data-fill="${esc(m.home)}|${esc(m.away)}">${esc(m.home)} × ${esc(m.away)}</button>`).join(' ')}</p>
      ${check('allowDraw', 'خيار التعادل متاح', p.allowDraw)}
      ${check('closed', 'قفل التصويت', p.closed)}
      ${check('reset', 'تصفير الأصوات (يتصفّر تلقائياً إذا غيّرت الفريقين)', false)}
      <p>النتيجة الحالية: ${esc(p.home)} <b>${counts.home}</b> · تعادل <b>${counts.draw}</b> · ${esc(p.away)} <b>${counts.away}</b></p>
      <button class="btn">💾 حفظ ونشر</button></form>`;
  },
  quiz() {
    const q = priv.quiz;
    const norm = (s) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
    const ok = new Set(q.accepted.map(norm));
    return `<form class="form" id="f">
      ${field('question', 'السؤال (عن معالم جازان أو لغز خفيف)', 'textarea', q.question)}
      <div class="row">${field('hint', 'تلميح (اختياري)', 'text', q.hint)}${field('prize', 'الجائزة', 'text', q.prize)}</div>
      ${field('accepted', 'الإجابات الصحيحة المقبولة (افصل بينها بفاصلة)', 'text', q.accepted.join('، '))}
      ${check('closed', 'قفل استقبال الإجابات', q.closed)}
      ${check('reset', 'بدء مسابقة جديدة (يمسح الإجابات والفائز السابق)', false)}
      <div class="actions"><button class="btn">💾 حفظ ونشر</button>
      <button type="button" class="btn sun" id="draw">🎲 سحب الفائز من الإجابات الصحيحة</button></div>
    </form>
    ${q.winner ? `<div class="winner">🏆 الفائز: <b>${esc(q.winner.name)}</b> ${esc(q.winner.dept)} (من ${q.winner.correctCount} إجابة صحيحة)</div>` : ''}
    <h3 style="margin-top:20px">الإجابات (${q.answers.length})</h3>
    <table class="table"><tr><th>الاسم</th><th>الإدارة</th><th>الإجابة</th><th>الوقت</th></tr>
    ${q.answers.map((a) => `<tr class="${ok.has(norm(a.answer)) ? 'correct' : ''}"><td>${esc(a.name)}</td><td>${esc(a.dept)}</td><td>${esc(a.answer)} ${ok.has(norm(a.answer)) ? '✅' : ''}</td><td class="muted">${timeAgo(a.createdAt)}</td></tr>`).join('')}
    </table>`;
  },
  lens() {
    const photos = [...priv.photos].reverse();
    return `<p class="muted">الصور توصل هنا من الموظفين. "اعتماد" يخليها تظهر في المعرض، و"صورة العدد" تطلع كبيرة فوق.</p>
    <div class="admin-photos">${photos.map((p) => `
      <div class="card">
        <a href="${esc(p.url)}" target="_blank"><img src="${esc(p.url)}" alt=""></a>
        <div><b>${esc(p.name)}</b> <span class="muted small">${timeAgo(p.createdAt)}</span><br><span class="small">${esc(p.caption)}</span></div>
        <div class="actions">
          <button class="pill" data-photo="${p.id}" data-op="feature">${pub.featuredPhotoId === p.id ? '🏆 صورة العدد ✓' : '🏆 صورة العدد'}</button>
          <button class="pill" data-photo="${p.id}" data-op="approve">${p.approved ? '✅ معتمدة' : '⏳ اعتماد'}</button>
          <button class="pill" data-photo="${p.id}" data-op="delete">🗑️</button>
        </div>
      </div>`).join('') || '<p class="muted">ما وصلت صور بعد.</p>'}</div>`;
  },
  box() {
    const list = [...priv.suggestions].reverse();
    return `<table class="table"><tr><th>النوع</th><th>المشاركة</th><th>من</th><th>الوقت</th><th></th></tr>
    ${list.map((s) => `<tr class="${s.done ? 'done' : ''}"><td>${esc(s.type)}</td>
      <td style="white-space:pre-line">${esc(s.text)}${safeUrl(s.link) ? `<br><a href="${esc(safeUrl(s.link))}" target="_blank" rel="noopener">${esc(s.link)}</a>` : ''}</td>
      <td>${esc(s.name) || '<span class="muted">بدون اسم</span>'}</td><td class="muted">${timeAgo(s.createdAt)}</td>
      <td class="actions"><button class="pill" data-sug="${s.id}">${s.done ? '↩️' : '✔️ تم'}</button><button class="pill" data-sug-del="${s.id}">🗑️</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">الصندوق فاضي حالياً.</td></tr>'}</table>`;
  },
  comments() {
    const list = [...pub.comments].reverse();
    return `<table class="table"><tr><th>الاسم</th><th>التعليق</th><th>الوقت</th><th></th></tr>
    ${list.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.text)}</td><td class="muted">${timeAgo(c.createdAt)}</td>
      <td><button class="pill" data-cdel="${c.id}">🗑️ حذف</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">ما فيه تعليقات.</td></tr>'}</table>`;
  },
};

function formData(f) {
  const o = {};
  f.querySelectorAll('[name]').forEach((i) => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
  return o;
}

function renderTab() {
  $('#tabs').innerHTML = Object.entries(TABS).map(([k, v]) => {
    const badge = k === 'box' ? priv.suggestions.filter((s) => !s.done).length
      : k === 'lens' ? priv.photos.filter((p) => !p.approved).length : 0;
    return `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${v}${badge ? ` (${badge})` : ''}</button>`;
  }).join('');
  const body = $('#tab-body');
  if (LIST_SCHEMAS[tab]) { body.innerHTML = listEditor(tab); bindList(tab); return; }
  body.innerHTML = views[tab]();
  const f = $('#f');
  if (f) {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const data = formData(f);
      if (data.reset && !confirm('متأكد؟ هذا بيمسح النتائج السابقة')) return;
      try {
        await adminApi(`/api/admin/section/${tab}`, { method: 'PUT', body: data });
        toast('تم الحفظ والنشر ✅');
        await load();
      } catch (err) { toast(err.message, true); }
    };
  }
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) { tab = b.dataset.tab; renderTab(); }
});

$('#tab-body').addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  try {
    if (t.dataset.fill) {
      const [h, a] = t.dataset.fill.split('|');
      $('#f').home.value = h; $('#f').away.value = a;
      $('#f').question.value = `مين تتوقع يفوز: ${h} ولا ${a}؟`;
      return;
    }
    if (t.id === 'draw') {
      if (!confirm('نسحب الفائز الحين؟ بيتقفل استقبال الإجابات.')) return;
      const { winner } = await adminApi('/api/admin/quiz/draw', { method: 'POST' });
      toast(`🎉 الفائز: ${winner.name}`);
    } else if (t.dataset.photo) {
      if (t.dataset.op === 'delete' && !confirm('حذف الصورة نهائياً؟')) return;
      await adminApi(`/api/admin/photos/${t.dataset.photo}/${t.dataset.op}`, { method: 'POST' });
    } else if (t.dataset.sug) {
      await adminApi(`/api/admin/suggestions/${t.dataset.sug}`, { method: 'POST' });
    } else if (t.dataset.sugDel) {
      if (!confirm('حذف المشاركة؟')) return;
      await adminApi(`/api/admin/suggestions/${t.dataset.sugDel}`, { method: 'DELETE' });
    } else if (t.dataset.cdel) {
      await adminApi(`/api/admin/comments/${t.dataset.cdel}`, { method: 'DELETE' });
    } else return;
    await load();
  } catch (err) { toast(err.message, true); }
});

// ---------- الدخول والتحميل ----------

async function load() {
  [pub, priv] = await Promise.all([api('/api/state'), adminApi('/api/admin/data')]);
  $('#login').hidden = true;
  $('#panel').hidden = false;
  renderTab();
}

function showLogin() {
  token = '';
  store.set('wk-admin', '');
  $('#panel').hidden = true;
  $('#login').hidden = false;
}

$('#login').onsubmit = async (e) => {
  e.preventDefault();
  try {
    ({ token } = await api('/api/admin/login', { method: 'POST', body: { password: e.target.password.value } }));
    store.set('wk-admin', token);
    await load();
  } catch (err) { $('.form-msg', e.target).textContent = err.message; $('.form-msg', e.target).classList.add('bad'); }
};

$('#logout').onclick = showLogin;

if (token) load().catch(showLogin); else showLogin();
