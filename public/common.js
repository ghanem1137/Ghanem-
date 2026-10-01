// أدوات مشتركة بين صفحة الموظفين ولوحة الإدارة
'use strict';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* تجاهل */ } },
};

function getVoterId() {
  let v = store.get('wk-voter');
  if (!v) {
    v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
    store.set('wk-voter', v);
  }
  return v;
}
const VOTER = getVoterId();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeUrl(u) {
  if (!String(u ?? '').trim()) return '';
  try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Voter-Id': VOTER, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'صار خطأ، جرّب مرة ثانية');
  return data;
}

let toastTimer;
function toast(msg, bad) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'الحين';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long' }); } catch { return d; }
}

const LABELS = {
  rec: { restaurant: ['🍽️', 'مطعم'], cafe: ['☕', 'كافيه'], movie: ['🎬', 'فيلم'], book: ['📚', 'كتاب'], series: ['📺', 'مسلسل'], place: ['🏝️', 'مكان'], other: ['✨', 'توصية'] },
  creative: { article: ['📝', 'مقالة'], podcast: ['🎙️', 'بودكاست'], poem: ['🪶', 'قصيدة'], other: ['🎨', 'مشاركة'] },
  occasion: { welcome: ['👋', 'أهلاً وسهلاً'], congrats: ['🎉', 'مبروك'], birthday: ['🎂', 'عيد ميلاد سعيد'], promotion: ['🚀', 'ترقية'], baby: ['🍼', 'مولود جديد'], farewell: ['🤍', 'وداعاً'] },
};
const label = (group, key) => LABELS[group][key] || LABELS[group].other || ['✨', key];
