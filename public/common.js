// أدوات مشتركة بين صفحة الموظفين ولوحة الإدارة
'use strict';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* تجاهل */ } },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeUrl(u) {
  if (!String(u ?? '').trim()) return '';
  try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // انتهت الجلسة أو ما سجّل دخول: نوديه لصفحة الدخول ونرجعه لنفس المكان بعدها
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash);
    return new Promise(() => {});
  }
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

// أرقام عربية (٠١٢٣) مثل هوية الجهة
const arNum = (n) => String(n).replace(/\d/g, (x) => '٠١٢٣٤٥٦٧٨٩'[x]);

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

// رموز حالة الطقس (WMO) من Open-Meteo
function weatherInfo(code) {
  if (code === 0) return ['☀️', 'صحو'];
  if (code <= 2) return ['🌤️', 'غائم جزئياً'];
  if (code === 3) return ['☁️', 'غائم'];
  if (code <= 48) return ['🌫️', 'ضباب'];
  if (code <= 57) return ['🌦️', 'رذاذ'];
  if (code <= 67) return ['🌧️', 'مطر'];
  if (code <= 77) return ['❄️', 'ثلج'];
  if (code <= 82) return ['🌦️', 'زخات مطر'];
  if (code <= 86) return ['🌨️', 'زخات ثلج'];
  return ['⛈️', 'عواصف رعدية'];
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
}

// أيقونات خطية بسيطة (نفس أسلوب أيقونات هوية الجهة)
const ICON_PATHS = {
  matches: '<circle cx="12" cy="12" r="10"/><polygon points="12 7 15.5 9.5 14.2 13.5 9.8 13.5 8.5 9.5"/><path d="M12 7V2.5M15.5 9.5l4-1.5M14.2 13.5l2.5 3.8M9.8 13.5l-2.5 3.8M8.5 9.5l-4-1.5"/>',
  poll: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  recs: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  lens: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  creative: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  selfdev: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  box: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  occasions: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  tv: '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
};
const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.grid}</svg>`;
