'use strict';
// Backend chat: Node.js thuần (http) + SQLite (node:sqlite) + Server-Sent Events (thời gian thực)
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function createApp(dbFile) {
  const db = new DatabaseSync(dbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_msg ON messages(to_id, from_id, id);`);
  const clients = new Map(); // userId -> Set<res> (các kết nối SSE đang mở)
  const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  const readBody = req => new Promise((ok, no) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) { no(new Error('Dữ liệu quá lớn')); req.destroy(); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(new Error('JSON không hợp lệ')); } });
  });
  const authUser = (req, url) => {
    const t = (req.headers.authorization || '').slice(7) || url.searchParams.get('token');
    return t ? db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(t) || null : null;
  };
  const emit = (ids, event, data) => {
    const p = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const id of ids) for (const r of clients.get(id) || []) r.write(p);
  };
  const newSession = uid => { const t = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO sessions VALUES(?,?)').run(t, uid); return t; };

  const routes = {
    'POST /api/register': async (req, res) => {
      const { username, password } = await readBody(req);
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username || '')) return json(res, 400, { error: 'Tên đăng nhập 3-20 ký tự (chữ, số, _)' });
      if (typeof password !== 'string' || password.length < 6) return json(res, 400, { error: 'Mật khẩu tối thiểu 6 ký tự' });
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return json(res, 409, { error: 'Tên đăng nhập đã tồn tại' });
      const salt = crypto.randomBytes(16).toString('hex');
      const r = db.prepare('INSERT INTO users(username, salt, hash) VALUES(?,?,?)').run(username, salt, hash(password, salt));
      const id = Number(r.lastInsertRowid);
      emit([...clients.keys()], 'presence', {});
      json(res, 201, { token: newSession(id), user: { id, username } });
    },
    'POST /api/login': async (req, res) => {
      const { username, password } = await readBody(req);
      const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
      if (!u || hash(String(password || ''), u.salt) !== u.hash) return json(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' });
      json(res, 200, { token: newSession(u.id), user: { id: u.id, username: u.username } });
    },
    'POST /api/logout': async (req, res, me, url) => {
      const t = (req.headers.authorization || '').slice(7);
      db.prepare('DELETE FROM sessions WHERE token = ?').run(t); json(res, 200, { ok: true });
    },
    'GET /api/users': async (req, res, me) => {
      const list = db.prepare('SELECT id, username FROM users WHERE id != ? ORDER BY username').all(me.id)
        .map(u => ({ id: u.id, username: u.username, online: clients.has(u.id) }));
      json(res, 200, list);
    },
    'GET /api/messages': async (req, res, me, url) => {
      const w = Number(url.searchParams.get('with') || 0);
      const rows = w === 0
        ? db.prepare('SELECT * FROM (SELECT m.*, u.username AS from_name FROM messages m JOIN users u ON u.id = m.from_id WHERE m.to_id = 0 ORDER BY m.id DESC LIMIT 200) ORDER BY id').all()
        : db.prepare('SELECT * FROM (SELECT m.*, u.username AS from_name FROM messages m JOIN users u ON u.id = m.from_id WHERE (m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?) ORDER BY m.id DESC LIMIT 200) ORDER BY id').all(me.id, w, w, me.id);
      json(res, 200, rows);
    },
    'POST /api/messages': async (req, res, me) => {
      const { to, text } = await readBody(req);
      const t = String(text || '').trim(), toId = Number(to || 0);
      if (!t || t.length > 2000) return json(res, 400, { error: 'Tin nhắn rỗng hoặc quá dài (tối đa 2000 ký tự)' });
      if (toId !== 0 && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(toId)) return json(res, 404, { error: 'Người nhận không tồn tại' });
      const ts = Date.now();
      const r = db.prepare('INSERT INTO messages(from_id, to_id, text, ts) VALUES(?,?,?,?)').run(me.id, toId, t, ts);
      const msg = { id: Number(r.lastInsertRowid), from_id: me.id, from_name: me.username, to_id: toId, text: t, ts };
      emit(toId === 0 ? [...clients.keys()] : [me.id, toId], 'message', msg);
      json(res, 201, msg);
    },
    'GET /api/stream': async (req, res, me) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      if (!clients.has(me.id)) clients.set(me.id, new Set());
      clients.get(me.id).add(res);
      emit([...clients.keys()], 'presence', {});
      const hb = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(hb); const s = clients.get(me.id); s.delete(res);
        if (!s.size) { clients.delete(me.id); emit([...clients.keys()], 'presence', {}); }
      });
    },
  };
  const open = new Set(['POST /api/register', 'POST /api/login']);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const key = `${req.method} ${url.pathname}`, h = routes[key];
        if (!h) return json(res, 404, { error: 'Không tìm thấy' });
        let me = null;
        if (!open.has(key)) { me = authUser(req, url); if (!me) return json(res, 401, { error: 'Chưa đăng nhập' }); }
        return await h(req, res, me, url);
      }
      const rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = path.join(PUB, path.normalize(rel));
      if (!file.startsWith(PUB) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message }); else res.end(); }
  });
  return { server, db, close: () => new Promise(r => { for (const s of clients.values()) for (const c of s) c.end(); server.close(() => { db.close(); r(); }); server.closeAllConnections?.(); }) };
}
module.exports = { createApp };
