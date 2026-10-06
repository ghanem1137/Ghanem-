// ويكند سعيد — لوحة فريق النشرة
'use strict';

const $ = (s, el = document) => el.querySelector(s);
let pub = null;    // الحالة العامة
let priv = null;   // بيانات الإدارة (الاقتراحات، إجابات المسابقة، كل الصور)
let users = [];    // حسابات الموظفين
let lastCreds = []; // كلمات المرور اللي انعملت للتو (تظهر مرة وحدة فقط)
let tab = store.get('wk-admin-tab') || 'issue';
const adminApi = api;
const siteUrl = () => pub.issue.siteUrl || location.origin;

// ---------- تعريف الحقول ----------

const sel = (opts) => ({ type: 'select', opts });
// أحجام المشاركات في الصفحة
const SIZE_LABELS = { sm: 'صغير (٤ في الصف)', md: 'متوسط (٣ في الصف)', lg: 'كبير (٢ في الصف)', full: 'عرض كامل' };
const ITEM_SIZE = ['الحجم في الصفحة', sel({ '': 'حسب حجم القسم', ...SIZE_LABELS })];
// أقسام فيها بطاقة وحدة (الاستطلاع والمسابقة والصندوق): ما لها حجم مشاركات، بس عرض القسم
const NO_SIZE = ['poll', 'quiz', 'box'];
const sizeOpts = () => SIZE_LABELS;
const WIDTH_LABELS = { quarter: 'ربع الصفحة', third: 'ثلث الصفحة', half: 'نص الصفحة', full: 'الصفحة كاملة' };
const widthSelect = (id, value) => `<select ${id}>${Object.entries(WIDTH_LABELS).map(([k, v]) => `<option value="${k}" ${k === (value || 'full') ? 'selected' : ''}>${v}</option>`).join('')}</select>`;

// ---------- المرفقات الاختيارية (صورة و/أو مستند) ----------
function attachField(it) {
  const img = it.image || '';
  const fileUrl = it.fileUrl || '';
  return `<div class="attach-edit">
    <input type="hidden" name="image" value="${esc(img)}"><input type="hidden" name="fileUrl" value="${esc(fileUrl)}"><input type="hidden" name="fileName" value="${esc(it.fileName || '')}">
    <b class="small">📎 مرفق (اختياري)</b>
    ${img ? `<span class="att-chip"><img src="${esc(img)}" alt=""><button type="button" class="pill" data-unattach="image">إزالة الصورة</button></span>`
      : '<label class="pill">🖼️ إرفاق صورة<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-up="image" hidden></label>'}
    ${fileUrl ? `<span class="att-chip">📄 ${esc(it.fileName || 'مرفق')}<button type="button" class="pill" data-unattach="file">إزالة المستند</button></span>`
      : '<label class="pill">📄 إرفاق مستند<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" data-up="file" hidden></label>'}
    <span class="muted small att-status"></span>
  </div>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('ما قدرنا نقرأ الملف'));
    r.readAsDataURL(file);
  });
}

// الصور الكبيرة نصغّرها قبل الرفع (ما عدا GIF عشان ما تخرب الحركة)
async function shrinkImage(file) {
  if (file.type === 'image/gif') return { data: await fileToDataUrl(file), name: file.name };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('ما قدرنا نقرأ الصورة')); i.src = url; });
    const k = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.85), name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } finally { URL.revokeObjectURL(url); }
}

// رفع المرفقات وإزالتها (يشتغل في محرّر المشاركات ومحرّر الأقسام)
document.addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-up]');
  if (!input || !input.files[0]) return;
  const box = input.closest('.attach-edit');
  const file = input.files[0];
  const status = $('.att-status', box);
  try {
    if (file.size > 15 * 1024 * 1024) throw new Error('حجم الملف أكبر من 15 ميجا');
    status.textContent = 'جاري الرفع…';
    const up = input.dataset.up === 'image' ? await shrinkImage(file) : { data: await fileToDataUrl(file), name: file.name };
    const r = await adminApi('/api/admin/upload', { method: 'POST', body: up });
    const it = { image: $('[name=image]', box).value, fileUrl: $('[name=fileUrl]', box).value, fileName: $('[name=fileName]', box).value };
    if (input.dataset.up === 'image') it.image = r.url; else Object.assign(it, { fileUrl: r.url, fileName: r.name });
    box.outerHTML = attachField(it);
    toast('تم إرفاق الملف، لا تنسى تضغط حفظ ✅');
  } catch (err) { status.textContent = ''; toast(err.message, true); }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-unattach]');
  if (!b) return;
  const box = b.closest('.attach-edit');
  const it = { image: $('[name=image]', box).value, fileUrl: $('[name=fileUrl]', box).value, fileName: $('[name=fileName]', box).value };
  if (b.dataset.unattach === 'image') it.image = ''; else { it.fileUrl = ''; it.fileName = ''; }
  box.outerHTML = attachField(it);
});
const LIST_SCHEMAS = {
  matches: {
    label: 'مباراة', fields: {
      league: ['الدوري', 'text'], day: ['اليوم', sel({ 'الجمعة': 'الجمعة', 'السبت': 'السبت' })], time: ['الوقت', 'text'],
      home: ['الفريق الأول', 'text'], away: ['الفريق الثاني', 'text'], stadium: ['الملعب', 'text'], channel: ['القناة', 'text'],
      size: ITEM_SIZE,
    },
  },
  recommendations: {
    label: 'توصية', fields: {
      category: ['النوع', sel(Object.fromEntries(Object.entries(LABELS.rec).map(([k, v]) => [k, v.join(' ')])))],
      title: ['العنوان (مثل: قهوة الجمعة)', 'text'], colleague: ['اسم الزميل', 'text'], itemName: ['اسم المكان / الفيلم / الكتاب', 'text'],
      description: ['ليش ينصح فيه؟', 'textarea'], location: ['الموقع (اختياري)', 'text'], link: ['رابط أو رابط تحميل الكتاب (يطلع له QR)', 'url'],
      size: ITEM_SIZE,
    },
  },
  creative: {
    label: 'مشاركة', fields: {
      type: ['النوع', sel(Object.fromEntries(Object.entries(LABELS.creative).map(([k, v]) => [k, v.join(' ')])))],
      title: ['العنوان', 'text'], author: ['اسم الزميل', 'text'], body: ['النص (المقالة أو القصيدة أو نبذة عن الحلقة)', 'textarea'],
      link: ['رابط (للبودكاست أو المقالة الكاملة)', 'url'], size: ITEM_SIZE,
    },
  },
  selfdev: {
    label: 'مقالة', fields: {
      title: ['العنوان', 'text'], summary: ['الملخص', 'textarea'], source: ['الكاتب / المصدر', 'text'],
      readMinutes: ['مدة القراءة (دقائق)', 'number'], link: ['رابط المقالة', 'url'], size: ITEM_SIZE,
    },
  },
  occasions: {
    label: 'مناسبة', fields: {
      type: ['النوع', sel(Object.fromEntries(Object.entries(LABELS.occasion).map(([k, v]) => [k, v.join(' ')])))],
      person: ['اسم الزميل', 'text'], text: ['الرسالة', 'text'], size: ITEM_SIZE,
    },
  },
};

const TABS = {
  issue: '📰 العدد', sections: '🗂️ ترتيب الأقسام وعناوينها', users: '👥 الموظفين', matches: '⚽ المباريات', poll: '🔮 الاستطلاع', recommendations: '💡 التوصيات',
  lens: '📸 عدسة الموظف', creative: '✍️ الإبداع', selfdev: '🌱 تطوير الذات', occasions: '🎉 المناسبات',
  quiz: '🧩 المسابقة', box: '📮 الصندوق', comments: '💬 التعليقات', email: '📧 نسخة الإيميل',
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
      <div class="head"><b><span class="drag" title="اسحب لتغيير المكان">⠿</span> ${esc(lbl)} ${i + 1}</b>
        <div class="actions">
          <button type="button" class="pill" data-move="-1" title="لفوق">⬆️</button>
          <button type="button" class="pill" data-move="1" title="لتحت">⬇️</button>
          <button type="button" class="pill" data-remove>🗑️ حذف</button>
        </div></div>
      <div class="row">${Object.entries(fields).map(([f, [l, t]]) => field(f, l, t, it[f] ?? '')).join('')}</div>
      ${attachField(it)}
    </div>`;
  return `
    <form class="form" id="list-form">
      ${items.length > 1 ? '<p class="muted small">رتّب الأماكن بسحب ⠿ أو بالأسهم، وبعدها اضغط حفظ ونشر.</p>' : ''}
      ${items.length ? '' : `<div class="empty-cta"><p>ما فيه ${esc(lbl === 'مباراة' ? 'مباريات' : lbl)} بعد هذا الأسبوع.</p>
        <button type="button" class="btn" id="add-first">➕ إضافة ${esc(lbl)}</button></div>`}
      <div class="editor-list">${items.map(one).join('')}</div>
      <div class="actions">
        <button type="button" class="btn ghost" id="add-item">➕ إضافة ${esc(lbl)}</button>
        <button class="btn" id="save-list">💾 حفظ ونشر</button>
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
  enableDrag($('.editor-list', form), () => {
    pub[key] = collectList(form);
    renderTab();
    $('#save-list').textContent = '💾 حفظ ونشر (الترتيب تغيّر)';
  });
  const first = $('#add-first');
  if (first) first.onclick = () => $('#add-item').click();
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
      ${field('footer', 'سطر نهاية الصفحة', 'text', i.footer)}
      <h3 style="margin-top:10px">🏛️ هوية الجهة</h3>
      <div class="row">${field('orgName', 'اسم الجهة', 'text', i.orgName)}${field('orgNameEn', 'اسم الجهة بالإنجليزي', 'text', i.orgNameEn)}</div>
      <div class="logo-row">
        ${i.logo ? `<img src="${esc(i.logo)}" alt="الشعار الحالي">` : '<span class="muted">ما فيه شعار مرفوع</span>'}
        <label class="btn ghost sm">⬆️ رفع الشعار (PNG بخلفية شفافة أفضل)<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden></label>
        ${i.logo ? '<button type="button" class="pill" id="logo-del">حذف الشعار</button>' : ''}
        ${i.logo !== '/logo.png' ? '<button type="button" class="pill" id="logo-reset">استعادة الشعار الأساسي</button>' : ''}
      </div>
      ${field('siteUrl', 'رابط المنصة للموظفين (يُستخدم في QR والإيميلات)، مثل http://192.168.1.25:3000', 'url', i.siteUrl)}
      <p class="muted small">إذا تركته فاضي نستخدم الرابط اللي فاتح منه الحين: <span class="cred">${esc(location.origin)}</span></p>
      <button class="btn">💾 حفظ ونشر</button></form>`;
  },
  sections() {
    const w = priv.weather;
    const row = (s, i) => `
      <div class="item-editor ${s.visible ? '' : 'hidden-sec'}" data-key="${s.key}">
        <div class="head"><b><span class="drag" title="اسحب لتغيير المكان">⠿</span> ${i + 1}. ${esc(s.emoji)} ${esc(s.title)}
          <span class="state ${s.visible ? 'on' : 'off'}">${s.visible ? 'ظاهر' : 'مخفي'}</span>
          <span class="muted small hint">محتواه: ${esc(CONTENT_HINT[s.key] || '')}</span></b>
          <div class="actions">
            <button type="button" class="btn sm" data-goto="${SECTION_TAB[s.key]}">✏️ تعبئة محتوى القسم</button>
            ${check('visible', 'ظاهر للموظفين', s.visible)}
            <button type="button" class="pill" data-smove="-1" title="لفوق">⬆️</button>
            <button type="button" class="pill" data-smove="1" title="لتحت">⬇️</button>
          </div></div>
        <div class="sec-row">
          ${field('emoji', 'أيقونة', 'text', s.emoji)}${field('nav', 'الاسم في القائمة', 'text', s.nav)}
          ${field('title', 'العنوان', 'text', s.title)}${field('subtitle', 'العنوان الفرعي', 'text', s.subtitle)}
        </div>
        <div class="row">
          ${field('width', 'عرض القسم في الصفحة', sel(WIDTH_LABELS), s.width || 'full')}
          ${NO_SIZE.includes(s.key) ? '' : field('size', 'حجم المشاركات في هذا القسم', sel(sizeOpts(s.key)), s.size || 'md')}
        </div>
        ${attachField(s)}
      </div>`;
    return `<p class="notice">💡 أسهل طريقة لتغيير الأحجام: افتح الصفحة واضغط <b>📐 تنسيق الصفحة</b> أعلاها، وغيّر حجم أي مشاركة أو عرض أي قسم بضغطة.</p>
      <p class="notice" style="margin-top:8px">✏️ غيّر عناوين الأقسام وعناوينها الفرعية متى ما تبي. رتّب أماكنها في الصفحة بسحب ⠿ أو بالأسهم.
      إذا ما فيه مشاركة في قسم هالأسبوع، شيل علامة "ظاهر للموظفين" ومحتواه يبقى محفوظ، وترجّعه الأسبوع الجاي بنفس الطريقة.</p>
      <form class="form" id="f-sections" style="margin-top:14px">
        <div class="editor-list">${pub.sections.map(row).join('')}</div>
        <button class="btn">💾 حفظ العناوين والترتيب</button>
      </form>
      <h3 style="margin-top:28px">🌤️ الطقس أعلى الصفحة</h3>
      <form class="form" id="f-weather">
        <div class="row">${field('city', 'المدينة', 'text', w.city)}</div>
        ${check('enabled', 'إظهار الطقس', w.enabled)}
        <p class="muted small">البيانات من Open-Meteo (مجانية) وتتحدّث كل نص ساعة. الإحداثيات الحالية: <span class="cred">${w.lat.toFixed(3)}, ${w.lon.toFixed(3)}</span></p>
        <button class="btn">💾 حفظ</button>
      </form>`;
  },
  users() {
    const credsBox = lastCreds.length ? `
      <div class="card" style="margin:16px 0;border-color:var(--sun)">
        <h3>✅ تم إنشاء ${lastCreds.length} حساب</h3>
        <p class="notice">⚠️ كلمات المرور تظهر <b>مرة وحدة فقط</b>. نزّل الملف الحين أو أرسلها للموظفين قبل ما تطلع من الصفحة.</p>
        <div class="actions" style="margin:10px 0"><button type="button" class="btn sun" id="dl-csv">⬇️ تنزيل الحسابات (Excel/CSV)</button></div>
        <div class="table-wrap"><table class="table"><tr><th>الاسم</th><th>الإيميل</th><th>اسم المستخدم</th><th>كلمة المرور</th><th></th></tr>
        ${lastCreds.map((c, i) => `<tr><td>${esc(c.name)}</td><td class="cred">${esc(c.email)}</td><td class="cred">${esc(c.username)}</td><td class="cred">${esc(c.password)}</td>
          <td>${c.email ? `<a class="pill" href="${esc(mailto(c))}" data-sent="${i}">✉️ أرسل بأوتلوك</a>` : ''}</td></tr>`).join('')}
        </table></div>
      </div>` : '';
    return `
      <form class="form" id="f-import">
        <h3>➕ إضافة موظفين</h3>
        <label>الصق القائمة هنا: كل سطر فيه اسم الموظف وإيميله (تقدر تنسخ عمودين من الإكسل مباشرة)
          <textarea name="text" rows="6" dir="auto" placeholder="أحمد محمد, ahmed.m@company.com&#10;سارة علي, sara.ali@company.com"></textarea></label>
        <p class="muted small">اسم المستخدم يتكوّن من أول الإيميل (قبل @)، والموظف يقدر يدخل بالإيميل كامل بعد. إذا ما فيه اسم نأخذه من الإيميل وتقدر تعدّله تحت.</p>
        <button class="btn">إنشاء الحسابات</button>
      </form>
      ${credsBox}
      <h3 style="margin-top:24px">👥 الحسابات (${users.length})</h3>
      <input id="user-search" placeholder="🔍 ابحث بالاسم أو الإيميل" style="margin:8px 0">
      <div class="table-wrap"><table class="table" id="users-table"><tr><th>الاسم</th><th>الإيميل</th><th>اسم المستخدم</th><th>مدير</th><th>آخر دخول</th><th></th></tr>
      ${users.map((u) => `<tr data-uid="${u.id}" data-search="${esc((u.name + ' ' + u.email + ' ' + u.username).toLowerCase())}">
        <td><input name="name" value="${esc(u.name)}" style="min-width:140px"></td>
        <td class="cred">${esc(u.email)}</td><td class="cred">${esc(u.username)}</td>
        <td><input type="checkbox" name="isAdmin" ${u.isAdmin ? 'checked' : ''} style="width:auto"></td>
        <td class="muted small">${u.lastLogin ? timeAgo(u.lastLogin) : 'ما دخل بعد'}</td>
        <td class="actions"><button class="pill" data-uop="save">💾</button><button class="pill" data-uop="reset">🔑 كلمة مرور جديدة</button>
          ${u.id === pub.me.id ? '' : '<button class="pill" data-uop="delete">🗑️</button>'}</td></tr>`).join('')}
      </table></div>`;
  },
  email() {
    return `<p class="notice">📧 هذي نسخة HTML من العدد الحالي جاهزة للإيميل. اضغط <b>نسخ</b> وبعدها الصقها في رسالة جديدة في أوتلوك (Ctrl+V)، أو نزّلها كملف HTML.
      الأزرار في الإيميل تودّي الموظفين للمنصة عشان يصوّتون ويعلّقون: <span class="cred">${esc(siteUrl())}</span></p>
      <div class="actions" style="margin:14px 0">
        <button type="button" class="btn" id="copy-email">📋 نسخ للصق في أوتلوك</button>
        <button type="button" class="btn ghost" id="dl-email">⬇️ تنزيل ملف HTML</button>
      </div>
      <div class="email-preview" id="email-preview"><p class="muted" style="padding:20px">جاري التجهيز…</p></div>`;
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
    return `<form class="card form" id="f-photo-add" style="margin-bottom:18px;border-top:3px solid var(--c-orange)">
      <h3>📤 رفع صورة وصلتك من زميل</h3>
      <p class="muted small">للصور اللي وصلتك بالواتساب أو الإيميل: ارفعها هنا باسم صاحبها، وتظهر في الصفحة على طول.</p>
      <div class="row">
        <label>اسم الزميل صاحب الصورة<input name="name" required maxlength="80" placeholder="مثلاً: أحمد محمد"></label>
        <label>وصف الصورة (اختياري)<input name="caption" maxlength="200" placeholder="مثلاً: غروب الشمس من كورنيش جازان"></label>
      </div>
      <label>الصورة (JPG أو PNG)<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label>
      ${check('featured', 'اجعلها صورة العدد (تطلع كبيرة فوق)', false)}
      <button class="btn">⬆️ رفع الصورة</button>
    </form>
    <p class="muted">الصور اللي يرسلها الموظفين من الصفحة توصل هنا. "اعتماد" يخليها تظهر في المعرض، و"صورة العدد" تطلع كبيرة فوق.</p>
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

// ---------- إظهار/إخفاء القسم من تبويبه ----------

const TAB_SECTION = {
  matches: 'matches', poll: 'poll', recommendations: 'recs', lens: 'lens', creative: 'creative',
  selfdev: 'selfdev', occasions: 'occasions', quiz: 'quiz', box: 'box',
};
const SECTION_TAB = Object.fromEntries(Object.entries(TAB_SECTION).map(([t, k]) => [k, t]));
// وش يكتب المدير في كل قسم (يظهر جنب زر تعبئة المحتوى)
const CONTENT_HINT = {
  matches: 'الفرق، الدوري، اليوم والوقت، الملعب والقناة',
  poll: 'سؤال التصويت والفريقين أو الخيارين',
  recs: 'التوصية (كافيه، مطعم، كتاب…) واسم الزميل والرابط',
  lens: 'اعتماد صور الموظفين واختيار صورة العدد',
  creative: 'المقالة أو القصيدة أو البودكاست واسم الكاتب',
  selfdev: 'عنوان المقالة وملخصها والرابط',
  occasions: 'اسم الزميل ونوع المناسبة والرسالة',
  quiz: 'سؤال المسابقة والإجابات الصحيحة والجائزة',
  box: 'قراءة مشاركات واقتراحات الموظفين',
};
// أسماء التبويبات تتبع عناوين الأقسام وترتيبها في الصفحة
function tabOrder() {
  const secTabs = pub.sections.map((x) => SECTION_TAB[x.key]).filter(Boolean);
  return ['issue', 'sections', ...secTabs, 'users', 'comments', 'email'];
}
function tabLabel(k) {
  const sec = pub.sections.find((x) => x.key === TAB_SECTION[k]);
  return sec ? [sec.emoji, sec.title].filter(Boolean).join(' ') : TABS[k];
}
function goTab(k) {
  tab = k;
  renderTab();
  scrollTo({ top: 0, behavior: 'smooth' });
}

function visBar() {
  const sec = pub.sections.find((x) => x.key === TAB_SECTION[tab]);
  if (!sec) return '';
  return `<div class="sec-title-edit" id="sec-title-edit">
    <h3>${esc([sec.emoji, sec.title].filter(Boolean).join(' '))}</h3>
    <p class="muted small">✏️ هنا تكتب: ${esc(CONTENT_HINT[sec.key] || '')}</p>
    <div class="row">
      <label>عنوان القسم في الصفحة<input id="sec-title" value="${esc(sec.title)}"></label>
      <label>العنوان الفرعي<input id="sec-subtitle" value="${esc(sec.subtitle)}"></label>
    </div>
    <button type="button" class="btn sm ghost" id="save-title">حفظ العنوان</button>
  </div>
  <div class="vis-bar ${sec.visible ? '' : 'off'}" id="vis-bar">
    <span>${sec.visible
      ? '<span class="state on">ظاهر</span> هذا القسم ظاهر للموظفين في الصفحة'
      : '<span class="state off">مخفي</span> هذا القسم مخفي عن الموظفين، ومحتواه محفوظ لين ترجّعه'}</span>
    <span class="actions">
      <label class="size-pick">↔️ عرض القسم ${widthSelect('id="sec-width"', sec.width)}</label>
      ${NO_SIZE.includes(sec.key) ? '' : `<label class="size-pick">📐 حجم المشاركات
        <select id="sec-size">${Object.entries(sizeOpts(sec.key)).map(([k, v]) => `<option value="${k}" ${k === (sec.size || 'md') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`}
      <button type="button" class="btn sm ${sec.visible ? 'ghost' : ''}" id="toggle-vis">${sec.visible ? '🙈 إخفاء القسم هذا الأسبوع' : '👁️ إظهار القسم'}</button>
    </span>
  </div>`;
}

function bindVis() {
  const b = $('#toggle-vis');
  if (!b) return;
  const key = TAB_SECTION[tab];
  const saveSection = async (change, msg) => {
    const sections = pub.sections.map((x) => (x.key === key ? { ...x, ...change } : x));
    try {
      await adminApi('/api/admin/section/sections', { method: 'PUT', body: { sections } });
      pub.sections = sections;
      $('#sec-title-edit').remove();
      $('#vis-bar').outerHTML = visBar();
      bindVis();
      renderTabsBar();
      toast(msg(sections.find((x) => x.key === key)));
    } catch (err) { toast(err.message, true); }
  };
  b.onclick = () => saveSection({ visible: !pub.sections.find((x) => x.key === key).visible },
    (s) => (s.visible ? 'رجع القسم للصفحة ✅' : 'تم إخفاء القسم، ومحتواه محفوظ ✅'));
  const size = $('#sec-size');
  if (size) size.onchange = () => saveSection({ size: size.value }, () => 'تم تغيير حجم المشاركات ✅');
  const st = $('#save-title');
  if (st) st.onclick = () => saveSection({ title: $('#sec-title').value, subtitle: $('#sec-subtitle').value }, () => 'تم حفظ العنوان ✅');
  const width = $('#sec-width');
  if (width) width.onchange = () => saveSection({ width: width.value }, () => 'تم تغيير عرض القسم ✅');
}

// ---------- السحب والإفلات لتغيير الأماكن (والأسهم تشتغل بعد على الجوال) ----------

function enableDrag(list, onReorder) {
  let dragEl = null;
  list.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.drag');
    if (h) h.closest('.item-editor').draggable = true;
  });
  list.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('.item-editor');
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  list.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const over = e.target.closest('.item-editor');
    if (!over || over === dragEl || over.parentNode !== list) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(dragEl, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
  });
  list.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl.draggable = false;
    dragEl = null;
    onReorder();
  });
}

function renderTabsBar() {
  $('#tabs').innerHTML = tabOrder().map((k) => {
    const v = tabLabel(k);
    const badge = k === 'box' ? priv.suggestions.filter((s) => !s.done).length
      : k === 'lens' ? priv.photos.filter((p) => !p.approved).length : 0;
    const sec = pub.sections.find((x) => x.key === TAB_SECTION[k]);
    const off = sec && !sec.visible;
    return `<button class="${k === tab ? 'on' : ''} ${off ? 'off' : ''}" data-tab="${k}" ${off ? 'title="القسم مخفي عن الموظفين"' : ''}>${v}${badge ? ` (${badge})` : ''}</button>`;
  }).join('');
}

function renderTab() {
  renderTabsBar();
  store.set('wk-admin-tab', tab);
  const body = $('#tab-body');
  if (LIST_SCHEMAS[tab]) { body.innerHTML = visBar() + listEditor(tab); bindVis(); bindList(tab); return; }
  body.innerHTML = visBar() + views[tab]();
  bindVis();
  if (tab === 'sections') return bindSections();
  if (tab === 'issue') bindLogo();
  if (tab === 'lens') bindPhotoAdd();
  if (tab === 'users') return bindUsers();
  if (tab === 'email') return bindEmail();
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
$('#tab-body').addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) goTab(g.dataset.goto);
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
      await adminApi(`/api/comments/${t.dataset.cdel}`, { method: 'DELETE' });
    } else return;
    await load();
  } catch (err) { toast(err.message, true); }
});

// ---------- الأقسام والعناوين ----------

function collectSections() {
  return [...document.querySelectorAll('#f-sections .item-editor')].map((el) => {
    const o = { ...pub.sections.find((x) => x.key === el.dataset.key), key: el.dataset.key };
    el.querySelectorAll('[name]').forEach((i) => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
    return o;
  });
}

function bindSections() {
  const f = $('#f-sections');
  enableDrag($('.editor-list', f), () => {
    pub.sections = collectSections();
    renderTab();
    $('#f-sections button.btn').textContent = '💾 حفظ العناوين والترتيب (الترتيب تغيّر)';
  });
  f.addEventListener('change', (e) => {
    if (e.target.name !== 'visible') return;
    const row = e.target.closest('.item-editor');
    row.classList.toggle('hidden-sec', !e.target.checked);
    const st = $('.state', row);
    st.className = `state ${e.target.checked ? 'on' : 'off'}`;
    st.textContent = e.target.checked ? 'ظاهر' : 'مخفي';
  });
  f.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-smove]');
    if (!mv) return;
    const list = collectSections();
    const i = list.findIndex((x) => x.key === mv.closest('.item-editor').dataset.key);
    const j = i + Number(mv.dataset.smove);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    pub.sections = list;
    renderTab();
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await adminApi('/api/admin/section/sections', { method: 'PUT', body: { sections: collectSections() } });
      toast('تم حفظ العناوين ✅');
      await load();
    } catch (err) { toast(err.message, true); }
  };
  $('#f-weather').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await adminApi('/api/admin/section/weather', { method: 'PUT', body: formData(e.target) });
      toast('تم حفظ إعدادات الطقس ✅');
      await load();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- رفع صورة لعدسة الموظف باسم زميل ----------

function bindPhotoAdd() {
  const f = $('#f-photo-add');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const file = f.image.files[0];
    if (!file) return toast('اختر صورة', true);
    const btn = $('button.btn', f);
    btn.disabled = true;
    try {
      const { data } = await shrinkImage(file);
      await adminApi('/api/admin/photos', { method: 'POST', body: { name: f.name.value, caption: f.caption.value, image: data, featured: f.featured.checked } });
      toast('تم رفع الصورة وظهرت في الصفحة ✅');
      await load();
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}

// ---------- الشعار ----------

function readLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 240 / img.height); // حجم مناسب للترويسة
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ما قدرنا نقرأ الصورة')); };
    img.src = url;
  });
}

function bindLogo() {
  $('#logo-file').onchange = async (e) => {
    if (!e.target.files[0]) return;
    try {
      await adminApi('/api/admin/logo', { method: 'POST', body: { image: await readLogo(e.target.files[0]) } });
      toast('تم رفع الشعار ✅');
      await load();
    } catch (err) { toast(err.message, true); }
  };
  const reset = $('#logo-reset');
  if (reset) reset.onclick = async () => {
    try { await adminApi('/api/admin/logo', { method: 'POST', body: { reset: true } }); toast('رجع الشعار الأساسي ✅'); await load(); } catch (err) { toast(err.message, true); }
  };
  const del = $('#logo-del');
  if (del) del.onclick = async () => {
    try { await adminApi('/api/admin/logo', { method: 'POST', body: { image: '' } }); await load(); } catch (err) { toast(err.message, true); }
  };
}

// ---------- حسابات الموظفين ----------

function mailto(c) {
  const body = `هلا ${c.name}،\n\nهذي بيانات دخولك لمنصة «${pub.issue.title || 'ويكند سعيد'}» ☀️\n\n` +
    `الرابط: ${siteUrl()}\nاسم المستخدم: ${c.username}\nكلمة المرور: ${c.password}\n\n` +
    `تقدر تغيّر كلمة المرور من أعلى الصفحة بعد ما تدخل.\n\nويكند سعيد 💛`;
  return `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('بيانات دخولك لمنصة ويكند سعيد')}&body=${encodeURIComponent(body)}`;
}

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function credsCsv(list) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['الاسم', 'الإيميل', 'اسم المستخدم', 'كلمة المرور', 'رابط المنصة'],
    ...list.map((c) => [c.name, c.email, c.username, c.password, siteUrl()])];
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'); // BOM عشان الإكسل يقرأ العربي صح
}

function bindUsers() {
  $('#f-import').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    try {
      const { created, skipped } = await adminApi('/api/admin/users/import', { method: 'POST', body: { text: e.target.text.value } });
      lastCreds = [...created, ...lastCreds];
      await load();
      toast(`تم إنشاء ${created.length} حساب${skipped.length ? ` · تم تخطّي ${skipped.length}` : ''}`);
      if (skipped.length) alert('ما انعمل حساب لهذي الأسطر:\n\n' + skipped.map((x) => `• ${x.line} — ${x.reason}`).join('\n'));
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
  $('#dl-csv')?.addEventListener('click', () => download(`weekend-saeed-accounts-${new Date().toISOString().slice(0, 10)}.csv`, credsCsv(lastCreds), 'text/csv;charset=utf-8'));
  $('#user-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#users-table tr[data-uid]').forEach((tr) => { tr.hidden = q && !tr.dataset.search.includes(q); });
  });
  $('#users-table').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-uop]');
    if (!b) return;
    const tr = b.closest('tr');
    const uid = tr.dataset.uid;
    const u = users.find((x) => x.id === uid);
    try {
      if (b.dataset.uop === 'save') {
        await adminApi(`/api/admin/users/${uid}`, { method: 'PUT', body: { name: $('[name=name]', tr).value, isAdmin: $('[name=isAdmin]', tr).checked } });
        toast('تم الحفظ ✅');
      } else if (b.dataset.uop === 'reset') {
        if (!confirm(`نعمل كلمة مرور جديدة لـ ${u.name}؟ القديمة بتوقف على طول.`)) return;
        const c = await adminApi(`/api/admin/users/${uid}/reset`, { method: 'POST' });
        lastCreds = [c, ...lastCreds.filter((x) => x.username !== c.username)];
      } else if (b.dataset.uop === 'delete') {
        if (!confirm(`حذف حساب ${u.name} نهائياً؟`)) return;
        await adminApi(`/api/admin/users/${uid}`, { method: 'DELETE' });
      }
      await load();
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- نسخة الإيميل (HTML متوافق مع أوتلوك) ----------

const E = {
  font: "font-family:Tahoma,Arial,sans-serif;",
  h2: 'margin:0 0 4px;font-size:19px;color:#17303d;border-right:4px solid #1f8a87;padding-right:10px;',
  sub: 'margin:0 0 12px;font-size:13px;color:#667784;',
  card: 'background:#ffffff;border:1px solid #e1e6ea;border-right:4px solid #1f8a87;border-radius:8px;padding:14px;margin:0 0 10px;',
};
const ebtn = (href, text, color = '#114b5f') =>
  `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;padding:9px 18px;border-radius:6px;font-size:14px;">${esc(text)}</a>`;
const EMAIL_STRIPE = ['#e0823a', '#8a2c47', '#1f8a87', '#3e95cf', '#6f9a2c', '#154b63']
  .map((c) => `<td height="5" style="background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join('');

function emailSection(s, weather) {
  const site = siteUrl();
  const head = `<h2 style="${E.h2}">${esc([s.emoji, s.title].filter(Boolean).join(' '))}</h2>${s.subtitle ? `<p style="${E.sub}">${esc(s.subtitle)}</p>` : ''}`;
  const trunc = (t, n) => (t.length > n ? t.slice(0, n).trim() + '…' : t);
  let body = '';
  switch (s.key) {
    case 'occasions':
      body = pub.occasions.map((o) => { const [ic, t] = label('occasion', o.type); return `<p style="margin:0 0 6px;">${ic} <b>${esc(t)} ${esc(o.person)}</b> — ${esc(o.text)}</p>`; }).join('');
      break;
    case 'matches':
      if (pub.matches.length) body = `<table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${pub.matches.map((m) => `
        <tr style="border-bottom:1px solid #e1e6ea;"><td style="color:#114b5f;font-weight:bold;">${esc(m.league)}</td>
        <td style="font-weight:bold;">${esc(m.home)} × ${esc(m.away)}</td><td style="color:#667784;">${esc(m.day)} ${esc(m.time)}</td>
        <td style="color:#667784;">${m.channel ? '📺 ' + esc(m.channel) : ''}</td></tr>`).join('')}</table>`;
      break;
    case 'poll':
      if (pub.poll.home) body = `<div style="${E.card}"><p style="margin:0 0 10px;font-size:16px;font-weight:bold;">${esc(pub.poll.question)}</p>${ebtn(site + '/#poll', '🔮 صوّت الحين')}</div>`;
      break;
    case 'recs':
      body = pub.recommendations.map((r) => {
        const [ic, cat] = label('rec', r.category);
        const link = safeUrl(r.link);
        return `<div style="${E.card}"><p style="margin:0;font-size:13px;color:#667784;">${ic} ${esc(cat)}</p>
          <p style="margin:2px 0;font-weight:bold;">${esc(r.title || cat)} ${r.category === 'book' ? 'ينصح فيه' : 'برأي'} زميلنا <span style="color:#e0823a;">${esc(r.colleague)}</span></p>
          <p style="margin:2px 0;font-size:16px;color:#114b5f;font-weight:bold;">${esc(r.itemName)}</p>
          <p style="margin:2px 0 8px;">${esc(r.description)}${r.location ? `<br><span style="color:#667784;font-size:13px;">📍 ${esc(r.location)}</span>` : ''}</p>
          ${link ? ebtn(link, r.category === 'book' ? '📥 تحميل الكتاب' : '🔗 الرابط') : ''}</div>`;
      }).join('');
      break;
    case 'lens': {
      const f = pub.photos.find((p) => p.id === pub.featuredPhotoId);
      body = f ? `<img src="${esc(site + f.url)}" width="600" alt="${esc(f.caption || 'صورة العدد')}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px;">
        <p style="margin:6px 0 10px;">🏆 <b>بعدسة ${esc(f.name)}</b>${f.caption ? ' — ' + esc(f.caption) : ''}</p>` : '';
      body += ebtn(site + '/#lens', '📤 أرسل صورتك للعدد الجاي', '#e0823a');
      break;
    }
    case 'creative':
      body = pub.creative.map((c) => { const [ic, t] = label('creative', c.type); const link = safeUrl(c.link); return `<div style="${E.card}">
        <p style="margin:0;font-size:13px;color:#667784;">${ic} ${esc(t)} · بقلم وصوت زميلنا <b>${esc(c.author)}</b></p>
        <p style="margin:2px 0 6px;font-size:16px;font-weight:bold;">${esc(c.title)}</p>
        ${c.body ? `<p style="margin:0 0 8px;white-space:pre-line;${c.type === 'poem' ? 'text-align:center;line-height:2;' : ''}">${esc(trunc(c.body, 500))}</p>` : ''}
        ${ebtn(link || site + '/#creative', c.type === 'podcast' ? '🎧 استمع' : '📖 اقرأ في المنصة')}</div>`; }).join('');
      break;
    case 'selfdev':
      body = pub.selfdev.map((x) => { const link = safeUrl(x.link); return `<div style="${E.card}"><p style="margin:0 0 4px;font-weight:bold;font-size:16px;">🌱 ${esc(x.title)}</p>
        <p style="margin:0 0 6px;">${esc(x.summary)}</p>${link ? `<a href="${esc(link)}" style="color:#114b5f;">كمّل القراءة ←</a>` : ''}</div>`; }).join('');
      break;
    case 'quiz': {
      const q = pub.quiz;
      if (q.question) body = `<div style="${E.card}border:2px dashed #e0823a;"><p style="margin:0;color:#e0823a;font-weight:bold;">سؤال الأسبوع</p>
        <p style="margin:4px 0 6px;font-size:16px;font-weight:bold;">${esc(q.question)}</p>
        ${q.prize ? `<p style="margin:0 0 10px;">🎁 الجائزة: <b>${esc(q.prize)}</b></p>` : ''}
        ${q.winner ? `<p style="margin:0;background:#fdf3dc;padding:10px;border-radius:8px;">🎉 مبروك للفائز <b>${esc(q.winner.name)}</b>!</p>` : ebtn(site + '/#quiz', '🧩 جاوب الحين', '#e0823a')}</div>`;
      break;
    }
    case 'box':
      body = ebtn(site + '/#box', '📮 شاركنا اقتراحك');
      break;
  }
  if (!body) return '';
  return `<tr><td style="padding:18px 22px 4px;">${head}${body}</td></tr>`;
}

function buildEmail(weather) {
  const i = pub.issue;
  const dates = [fmtDate(i.dateFrom), fmtDate(i.dateTo)].filter(Boolean).join(' – ');
  let wline = '';
  if (weather) {
    const [ic, txt] = weatherInfo(weather.current.code);
    const wk = weather.days.filter((d) => [5, 6].includes(new Date(d.date + 'T12:00:00').getDay())).slice(0, 2)
      .map((d) => `${new Date(d.date + 'T12:00:00').getDay() === 5 ? 'الجمعة' : 'السبت'} ${weatherInfo(d.code)[0]} ${d.max}°/${d.min}°`).join(' · ');
    wline = `<p style="margin:12px 0 0;font-size:14px;">${ic} ${esc(weather.city)}: <b>${weather.current.temp}°</b> ${txt}${wk ? ` · ${wk}` : ''}</p>`;
  }
  const sections = pub.sections.filter((s) => s.visible).map((s) => emailSection(s, weather)).join('');
  return `<div dir="rtl" style="${E.font}background:#f2f4f6;padding:16px 0;">
<table role="presentation" align="center" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;background:#f2f4f6;${E.font}color:#17303d;direction:rtl;text-align:right;">
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${EMAIL_STRIPE}</tr></table></td></tr>
<tr><td style="background:#114b5f;color:#ffffff;padding:22px;">
  ${i.logo ? `<span style="display:inline-block;background:#ffffff;padding:6px 12px;border-radius:6px;"><img src="${esc(siteUrl() + i.logo)}" height="64" alt="${esc(i.orgName)}" style="display:block;height:64px;width:auto;"></span>`
    : i.orgName ? `<p style="margin:0;font-size:14px;font-weight:bold;">${esc(i.orgName)}</p>` : ''}
  <p style="margin:14px 0 0;font-size:13px;color:#8fd0ea;">نشرة أسبوعية · العدد ${esc(arNum(i.number))}${dates ? ' · ' + esc(dates) : ''}</p>
  <h1 style="margin:4px 0 6px;font-size:30px;color:#ffffff;">${esc(i.title || 'ويكند سعيد')} ☀️</h1>
  <p style="margin:0;font-size:16px;">${esc(i.greeting)}</p>${wline}
  <p style="margin:16px 0 0;">${ebtn(siteUrl(), 'افتح المنصة وتفاعل معنا', '#e0823a')}</p>
</td></tr>
${sections}
<tr><td style="padding:22px;text-align:center;">
  ${i.quote ? `<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#114b5f;">“${esc(i.quote)}”</p>` : ''}
  <p style="margin:0;color:#667784;font-size:13px;">${esc(i.footer)}</p>
</td></tr>
</table></div>`;
}

async function bindEmail() {
  let weather = null;
  try { ({ weather } = await adminApi('/api/weather')); } catch { /* بدون طقس */ }
  if (tab !== 'email') return;
  const html = buildEmail(weather);
  $('#email-preview').innerHTML = html;
  $('#dl-email').onclick = () => download(`weekend-saeed-issue-${pub.issue.number}.html`,
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(pub.issue.title)} — العدد ${esc(pub.issue.number)}</title></head><body style="margin:0;">${html}</body></html>`,
    'text/html;charset=utf-8');
  $('#copy-email').onclick = async () => {
    try {
      if (window.isSecureContext && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([$('#email-preview').innerText], { type: 'text/plain' }),
        })]);
      } else {
        // المتصفح ما يسمح بالحافظة الحديثة على http، فننسخ بالتحديد
        const r = document.createRange();
        r.selectNodeContents($('#email-preview'));
        const sel = getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        document.execCommand('copy');
        sel.removeAllRanges();
      }
      toast('تم النسخ ✅ الحين افتح رسالة جديدة في أوتلوك والصق (Ctrl+V)');
    } catch { toast('ما قدرنا ننسخ، جرّب تنزيل الملف بدالها', true); }
  };
}

// ---------- التحميل ----------

async function load() {
  [pub, priv, { users }] = await Promise.all([api('/api/state'), adminApi('/api/admin/data'), adminApi('/api/admin/users')]);
  if (!TABS[tab]) tab = 'issue';
  $('#panel').hidden = false;
  $('#denied').hidden = true;
  renderTab();
}

// تحديث حي: الصندوق والصور والتعليقات تتحدّث لحالها، وتبويبات النماذج ما نلمسها عشان ما يضيع شي تكتبه
const LIVE_TABS = ['box', 'comments', 'lens'];
let liveTimer;
function connect() {
  const es = new EventSource('/api/events');
  es.onmessage = () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      try {
        [pub, priv] = await Promise.all([api('/api/state'), adminApi('/api/admin/data')]);
        if (LIVE_TABS.includes(tab)) renderTab();
        else renderTabsBar();
      } catch { /* نحاول مع التحديث الجاي */ }
    }, 300);
  };
}

load().then(connect).catch((err) => {
  $('#denied').hidden = false;
  $('#denied-msg').textContent = err.message;
});
