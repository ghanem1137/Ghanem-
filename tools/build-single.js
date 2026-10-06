// يبني نسخة "ملف HTML واحد" من المنصة: dist/weekend-saeed.html
// الاستخدام: npm run build:single
// الملف الناتج يشتغل بدون خادم، والبيانات تنحفظ في متصفح الجهاز اللي يفتحه.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist', 'weekend-saeed.html');

const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

// يستبدل نص لازم يكون موجود، عشان أي تغيير في الكود الأصلي يوقف البناء بدل ما يطلع ملف خربان
function swap(src, from, to, label) {
  if (!src.includes(from)) throw new Error(`build-single: ما لقيت "${label || from.slice(0, 60)}"`);
  return src.split(from).join(to);
}

// محتوى <body> بدون السكربتات ورسالة التنبيه (نضيفها مرة وحدة في الملف)
function bodyOf(html) {
  const m = /<body[^>]*>([\s\S]*)<\/body>/.exec(html);
  if (!m) throw new Error('build-single: ما فيه <body>');
  return m[1]
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<div id="toast"[^>]*><\/div>/, '')
    .trim();
}

// روابط الصفحات تصير روابط داخل الملف (#/ و #/admin و #/login)
const links = (html) => html
  .replace(/href="\/admin"/g, 'href="#/admin"')
  .replace(/href="\/"/g, 'href="#/"');

const inlineScript = (code) => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;

// ---------- القوالب ----------
const home = links(bodyOf(read('index.html')));
const admin = links(bodyOf(read('admin.html')));
const login = links(bodyOf(read('login.html')));

const homeTpl = swap(home, '<p class="muted" id="issue-footer"></p>',
  '<p class="muted" id="issue-footer"></p>\n      <p class="muted small local-only">نسخة الملف الواحد: البيانات محفوظة في متصفح هذا الجهاز فقط.</p>');

// ---------- السكربتات ----------
let common = read('common.js');
common = swap(common, "  if (res.status === 401 && !location.pathname.startsWith('/login')) {\n    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash);",
  "  if (res.status === 401 && !location.hash.startsWith('#/login')) {\n    go('login');", '401 redirect');
common = swap(common, "  location.href = '/login';", "  go('login');", 'logout redirect');
common += "\n// الرابط الأساسي للملف (يُستخدم في QR والإيميلات إذا ما انحط رابط المنصة)\nconst SITE_BASE = location.protocol === 'file:' ? location.href.split('#')[0] : location.origin;\n";

let app = read('app.js');
app = swap(app, '(state.issue.siteUrl || location.origin)', '(state.issue.siteUrl || SITE_BASE)');
app = swap(app, "window.addEventListener('load', async () => {\n  await refresh();\n  connect();\n  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();\n});",
  "(async () => {\n  await refresh();\n  connect();\n  if (/^#[\\w-]+$/.test(location.hash)) document.querySelector(location.hash)?.scrollIntoView();\n})();", 'app start');

let adminJs = read('admin.js');
adminJs = swap(adminJs, 'pub.issue.siteUrl || location.origin', 'pub.issue.siteUrl || SITE_BASE');
adminJs = swap(adminJs, '${esc(location.origin)}', '${esc(SITE_BASE)}');

const loginHtml = read('login.html');
let loginJs = /<script>\s*([\s\S]*?)<\/script>\s*<\/body>/.exec(loginHtml)[1];
loginJs = swap(loginJs, "        const next = new URLSearchParams(location.search).get('next') || '/';\n        location.href = /^\\/(?!\\/)/.test(next) ? next : '/';",
  "        go('home');", 'login redirect');

// ---------- الموجّه بين الصفحات + النسخ الاحتياطي ----------
const router = `'use strict';
const VIEW_TITLES = { home: 'ويكند سعيد', admin: 'إدارة ويكند سعيد', login: 'دخول — ويكند سعيد' };
function currentView() {
  if (location.hash.startsWith('#/admin')) return 'admin';
  if (location.hash.startsWith('#/login')) return 'login';
  return 'home';
}
function go(view) { location.hash = view === 'home' ? '#/' : '#/' + view; }
const ACTIVE_VIEW = currentView();
// الانتقال بين الصفحات يعيد تحميل الملف عشان تبدأ كل صفحة نظيفة (روابط الأقسام مثل #quiz ما تتأثر)
window.addEventListener('hashchange', () => { if (currentView() !== ACTIVE_VIEW) location.reload(); });
document.body.className = { home: 'loading', admin: '', login: 'login-page' }[ACTIVE_VIEW];
document.title = VIEW_TITLES[ACTIVE_VIEW];
document.getElementById('app').replaceChildren(document.getElementById('tpl-' + ACTIVE_VIEW).content.cloneNode(true));

// نسخة احتياطية: البيانات محلية، فنخلي المدير يحفظها ويرجعها أو ينقلها لجهاز ثاني
function backupTools() {
  const KEY = 'weekend-saeed-data-v1';
  const box = document.createElement('div');
  box.className = 'wrap local-only';
  box.innerHTML = '<div class="card" style="margin:18px 0"><h3>💾 النسخ الاحتياطي</h3>' +
    '<p class="muted small">البيانات في نسخة الملف الواحد محفوظة في هذا المتصفح فقط. نزّل نسخة احتياطية بشكل دوري، وتقدر ترجعها هنا أو على جهاز ثاني.</p>' +
    '<div class="actions"><button type="button" class="btn sm" id="bk-save">⬇️ تنزيل نسخة احتياطية</button>' +
    '<label class="btn ghost sm">⬆️ استرجاع نسخة<input type="file" id="bk-load" accept="application/json,.json" hidden></label></div></div>';
  document.getElementById('panel').appendChild(box);
  document.getElementById('bk-save').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([localStorage.getItem(KEY) || '{}'], { type: 'application/json' }));
    a.download = 'weekend-saeed-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  };
  document.getElementById('bk-load').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.users) || !data.users.some((u) => u.isAdmin) || !Array.isArray(data.sections)) throw new Error();
      if (!confirm('استرجاع النسخة بيستبدل كل البيانات الحالية في هذا المتصفح. نكمّل؟')) return;
      localStorage.setItem(KEY, JSON.stringify(data));
      location.reload();
    } catch { toast('الملف مو نسخة احتياطية صحيحة من ويكند سعيد', true); }
  };
}`;

// ---------- التجميع ----------
const html = `<!doctype html>
<!--
  ويكند سعيد — نسخة الملف الواحد (HTML5)
  يتولّد تلقائياً من مجلد public بالأمر: npm run build:single — لا تعدّله يدوياً.
  - مفتوح من خادم المنصة (server.js) على /weekend-saeed.html: بيانات مشتركة وتحديث مباشر لكل الموظفين.
  - مفتوح بدبل كلك من الجهاز: يشتغل محلياً والبيانات في متصفح هذا الجهاز فقط.
  دخول الإدارة أول مرة: admin / weekend123 (غيّرها من زر كلمة المرور)
-->
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ويكند سعيد</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☀️</text></svg>">
<style>
${read('styles.css')}
/* لما يكون الملف مفتوح من خادم المنصة، البيانات مشتركة فما نحتاج تنبيهات الوضع المحلي */
[data-mode="server"] .local-only { display: none !important; }
</style>
</head>
<body>
<div id="app"></div>
<div id="toast" class="toast" role="status" hidden></div>

<template id="tpl-home">
${homeTpl}
</template>

<template id="tpl-admin">
${admin}
</template>

<template id="tpl-login">
${login}
</template>

<!-- مكتبة رموز QR (MIT — Kazuhiko Arase) -->
${inlineScript(read('vendor/qrcode.js'))}
<!-- بديل الخادم داخل المتصفح -->
${inlineScript(swap(fs.readFileSync(path.join(__dirname, 'standalone-backend.js'), 'utf8'), '__DEFAULT_LOGO__',
  'data:image/png;base64,' + fs.readFileSync(path.join(PUB, 'logo.png')).toString('base64'), 'default logo'))}
<!-- أدوات مشتركة -->
${inlineScript(common)}
<!-- الموجّه -->
${inlineScript(router)}
<!-- الصفحات -->
${inlineScript(`function initHome() {\n${app}\n}\nfunction initAdmin() {\n${adminJs}\n}\nfunction initLogin() {\n${loginJs}\n}\n({ home: initHome, admin: () => { initAdmin(); backupTools(); }, login: initLogin })[ACTIVE_VIEW]();`)}
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✅ ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
