// قاعدة بيانات المنصة: SQLite المدمجة في Node.js (بدون أي مكتبات خارجية)
// الملف: data/weekend.db — جداول منفصلة للحسابات والجلسات والمحتوى والتفاعل وسجل العمليات.
// المنصة تقرأ البيانات كاملة عند التشغيل، وكل تعديل ينكتب في القاعدة داخل معاملة (transaction) وحدة.
'use strict';

// نخفي تنبيه "ميزة تجريبية" اللي يطلعه Node مع SQLite عشان ما يربك اللي يشغّل المنصة
const emitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  if (String(w?.message || w).includes('SQLite')) return;
  emitWarning.call(process, w, ...rest);
};
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.error('❌ قاعدة البيانات تحتاج Node.js نسخة 22.13 أو أحدث. نزّل آخر نسخة LTS من https://nodejs.org');
  process.exit(1);
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, username TEXT NOT NULL UNIQUE, pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee', created_at TEXT, last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, list TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, user_id TEXT, name TEXT, caption TEXT, url TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, target_id TEXT NOT NULL, user_id TEXT, name TEXT, text TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS likes (target_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (target_id, user_id));
CREATE TABLE IF NOT EXISTS poll_votes (user_id TEXT PRIMARY KEY, choice TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_answers (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, dept TEXT, answer TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS suggestions (id TEXT PRIMARY KEY, name TEXT, type TEXT, text TEXT, link TEXT, created_at TEXT, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, user_name TEXT, role TEXT, action TEXT NOT NULL, details TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_id);
CREATE INDEX IF NOT EXISTS idx_items_list ON items(list, position);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
`;

const LISTS = ['matches', 'recommendations', 'creative', 'selfdev', 'occasions'];
const SETTINGS = ['issue', 'sections', 'weather', 'featuredPhotoId'];

function openStore(file) {
  const sql = new DatabaseSync(file);
  sql.exec(SCHEMA);

  const all = (q, ...p) => sql.prepare(q).all(...p);
  const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

  // يرجّع البيانات بنفس الشكل اللي تشتغل عليه المنصة، أو null إذا القاعدة فاضية
  function load() {
    const settings = Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, json(r.value, null)]));
    if (!settings.issue) return null;
    const db = {
      issue: settings.issue,
      sections: settings.sections,
      weather: settings.weather,
      featuredPhotoId: settings.featuredPhotoId ?? null,
      poll: { ...settings.poll, votes: Object.fromEntries(all('SELECT user_id, choice FROM poll_votes').map((r) => [r.user_id, r.choice])) },
      quiz: {
        ...settings.quiz,
        answers: all('SELECT * FROM quiz_answers ORDER BY created_at').map((r) => ({
          id: r.id, userId: r.user_id, name: r.name, dept: r.dept, answer: r.answer, createdAt: r.created_at,
        })),
      },
      photos: all('SELECT * FROM photos ORDER BY created_at').map((r) => ({
        id: r.id, userId: r.user_id, name: r.name, caption: r.caption, url: r.url, approved: !!r.approved, createdAt: r.created_at,
      })),
      comments: all('SELECT * FROM comments ORDER BY created_at').map((r) => ({
        id: r.id, targetId: r.target_id, userId: r.user_id, name: r.name, text: r.text, createdAt: r.created_at,
      })),
      likes: {},
      suggestions: all('SELECT * FROM suggestions ORDER BY created_at').map((r) => ({
        id: r.id, name: r.name, type: r.type, text: r.text, link: r.link, createdAt: r.created_at, done: !!r.done,
      })),
      users: all('SELECT * FROM users ORDER BY created_at').map((r) => ({
        id: r.id, name: r.name, email: r.email || '', username: r.username, pass: r.pass, role: r.role, createdAt: r.created_at, lastLogin: r.last_login,
      })),
      sessions: Object.fromEntries(all('SELECT * FROM sessions').map((r) => [r.token_hash, { userId: r.user_id, exp: r.expires_at }])),
    };
    for (const l of LISTS) db[l] = all('SELECT data FROM items WHERE list = ? ORDER BY position', l).map((r) => json(r.data, {}));
    for (const r of all('SELECT target_id, user_id FROM likes')) (db.likes[r.target_id] = db.likes[r.target_id] || []).push(r.user_id);
    return db;
  }

  // يكتب الحالة كاملة في القاعدة داخل معاملة وحدة: إما ينحفظ كل شي أو ما يتغير شي
  function save(db) {
    const { votes, ...poll } = db.poll;
    const { answers, ...quiz } = db.quiz;
    sql.exec('BEGIN IMMEDIATE');
    try {
      const setting = sql.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const k of SETTINGS) setting.run(k, JSON.stringify(db[k] ?? null));
      setting.run('poll', JSON.stringify(poll));
      setting.run('quiz', JSON.stringify(quiz));

      sql.exec('DELETE FROM items');
      const item = sql.prepare('INSERT INTO items (id, list, position, data) VALUES (?, ?, ?, ?)');
      for (const l of LISTS) (db[l] || []).forEach((it, i) => item.run(it.id, l, i, JSON.stringify(it)));

      sql.exec('DELETE FROM users');
      const user = sql.prepare('INSERT INTO users (id, name, email, username, pass, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const u of db.users) user.run(u.id, u.name, u.email || '', u.username, u.pass, u.role, u.createdAt || null, u.lastLogin || null);

      sql.exec('DELETE FROM sessions');
      const ses = sql.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
      for (const [k, s] of Object.entries(db.sessions)) ses.run(k, s.userId, s.exp);

      sql.exec('DELETE FROM photos');
      const ph = sql.prepare('INSERT INTO photos (id, user_id, name, caption, url, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const p of db.photos) ph.run(p.id, p.userId || null, p.name, p.caption || '', p.url, p.approved ? 1 : 0, p.createdAt || null);

      sql.exec('DELETE FROM comments');
      const cm = sql.prepare('INSERT INTO comments (id, target_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const c of db.comments) cm.run(c.id, c.targetId, c.userId || null, c.name, c.text, c.createdAt || null);

      sql.exec('DELETE FROM likes');
      const lk = sql.prepare('INSERT INTO likes (target_id, user_id) VALUES (?, ?)');
      for (const [t, ids] of Object.entries(db.likes)) for (const u of new Set(ids)) lk.run(t, u);

      sql.exec('DELETE FROM poll_votes');
      const vote = sql.prepare('INSERT INTO poll_votes (user_id, choice) VALUES (?, ?)');
      for (const [u, c] of Object.entries(votes || {})) vote.run(u, c);

      sql.exec('DELETE FROM quiz_answers');
      const ans = sql.prepare('INSERT INTO quiz_answers (id, user_id, name, dept, answer, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const a of answers || []) ans.run(a.id, a.userId || null, a.name, a.dept || '', a.answer, a.createdAt || null);

      sql.exec('DELETE FROM suggestions');
      const sg = sql.prepare('INSERT INTO suggestions (id, name, type, text, link, created_at, done) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const s of db.suggestions) sg.run(s.id, s.name || '', s.type || '', s.text, s.link || '', s.createdAt || null, s.done ? 1 : 0);

      sql.exec('COMMIT');
    } catch (e) {
      sql.exec('ROLLBACK');
      throw e;
    }
  }

  // سجل العمليات: ينكتب مباشرة ولا ينحذف (للمراجعة والتدقيق)
  const auditStmt = sql.prepare('INSERT INTO audit_log (at, user_id, user_name, role, action, details) VALUES (?, ?, ?, ?, ?, ?)');
  function audit(user, action, details = '') {
    auditStmt.run(new Date().toISOString(), user?.id || null, user?.name || '', user?.role || '', action, String(details).slice(0, 500));
  }
  function auditList(limit = 300) {
    return all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit);
  }

  return { load, save, audit, auditList, close: () => sql.close() };
}

module.exports = { openStore };
