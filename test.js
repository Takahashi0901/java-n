'use strict';
// Kiểm thử tự động toàn bộ luồng chính (đăng ký, đăng nhập, chat riêng/nhóm, thời gian thực, lịch sử)
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
const { createApp } = require('./server');

async function runSelfTest() {
  const tmp = path.join(os.tmpdir(), `chat-test-${Date.now()}.db`);
  const app = createApp(tmp);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const results = []; let failed = 0;
  const check = (name, ok) => { results.push(`  ${ok ? '✔' : '✘'} ${name}`); if (!ok) failed++; };
  const call = async (p, method = 'GET', data, token) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: data ? JSON.stringify(data) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    const a = await call('/api/register', 'POST', { username: 'alice', password: 'secret1' });
    const b = await call('/api/register', 'POST', { username: 'bob', password: 'secret2' });
    check('Đăng ký tài khoản', a.status === 201 && b.status === 201);
    check('Chặn trùng tên đăng nhập', (await call('/api/register', 'POST', { username: 'alice', password: 'secret1' })).status === 409);
    check('Chặn mật khẩu ngắn', (await call('/api/register', 'POST', { username: 'carol', password: '123' })).status === 400);
    check('Từ chối sai mật khẩu', (await call('/api/login', 'POST', { username: 'alice', password: 'sai' })).status === 401);
    const login = await call('/api/login', 'POST', { username: 'alice', password: 'secret1' });
    check('Đăng nhập đúng', login.status === 200 && !!login.body.token);
    check('Từ chối truy cập khi chưa đăng nhập', (await call('/api/users')).status === 401);

    const ac = new AbortController();
    const sse = await fetch(`${base}/api/stream?token=${b.body.token}`, { signal: ac.signal });
    let buf = ''; const dec = new TextDecoder();
    (async () => { try { for await (const c of sse.body) buf += dec.decode(c); } catch {} })();
    const wait = async cond => { for (let i = 0; i < 50 && !cond(); i++) await new Promise(r => setTimeout(r, 50)); return cond(); };

    const users = await call('/api/users', 'GET', null, a.body.token);
    check('Danh sách người dùng + trạng thái online', users.body.length === 1 && users.body[0].online === true);
    await call('/api/messages', 'POST', { to: b.body.user.id, text: 'Chào Bob' }, a.body.token);
    check('Nhận tin nhắn riêng theo thời gian thực', await wait(() => buf.includes('Chào Bob')));
    await call('/api/messages', 'POST', { to: 0, text: 'Chào cả phòng' }, a.body.token);
    check('Nhận tin nhắn phòng chung theo thời gian thực', await wait(() => buf.includes('Chào cả phòng')));
    check('Chặn tin nhắn rỗng', (await call('/api/messages', 'POST', { to: 0, text: '   ' }, a.body.token)).status === 400);
    const hist = await call(`/api/messages?with=${b.body.user.id}`, 'GET', null, a.body.token);
    check('Lưu & đọc lịch sử chat riêng từ CSDL', hist.body.length === 1 && hist.body[0].text === 'Chào Bob');
    const grp = await call('/api/messages?with=0', 'GET', null, b.body.token);
    check('Lưu & đọc lịch sử phòng chung', grp.body.length === 1);
    const page = await fetch(base + '/'); const js = await fetch(base + '/app.js');
    check('Phục vụ giao diện React (index.html, app.js)', page.status === 200 && js.status === 200);
    check('Chặn truy cập file ngoài thư mục public', (await fetch(base + '/..%2fserver.js')).status === 404);
    ac.abort();
  } catch (e) { check('Lỗi không mong đợi: ' + e.message, false); }
  await app.close();
  for (const f of [tmp, tmp + '-wal', tmp + '-shm']) fs.rmSync(f, { force: true });
  return { failed, report: results.join('\n') };
}
module.exports = { runSelfTest };
if (require.main === module) runSelfTest().then(r => { console.log(r.report); console.log(r.failed ? `\n${r.failed} kiểm thử THẤT BẠI` : '\nTất cả kiểm thử ĐẠT'); process.exit(r.failed ? 1 : 0); });
