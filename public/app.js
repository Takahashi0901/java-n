const { useState, useEffect, useRef } = React;
const html = htm.bind(React.createElement);
const api = async (p, opt = {}, token) => {
  const r = await fetch('/api' + p, { ...opt, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Lỗi không xác định');
  return d;
};

function Login({ onAuth }) {
  const [mode, setMode] = useState('login'), [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr('');
    try { onAuth(await api('/' + mode, { method: 'POST', body: JSON.stringify({ username: u, password: p }) })); }
    catch (x) { setErr(x.message); }
  };
  return html`<form class="login" onSubmit=${submit}>
    <h2>💬 ${mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2>
    <input placeholder="Tên đăng nhập" value=${u} onInput=${e => setU(e.target.value)} />
    <input type="password" placeholder="Mật khẩu (≥ 6 ký tự)" value=${p} onInput=${e => setP(e.target.value)} />
    <div class="err">${err}</div>
    <button type="submit" style=${{ width: "100%" }}>${mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
    <button type="button" class="link" onClick=${() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
      ${mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</button>
  </form>`;
}

function Chat({ auth, onLogout }) {
  const [users, setUsers] = useState([]), [cur, setCur] = useState(0), [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState({}), [unread, setUnread] = useState({}), [text, setText] = useState('');
  const curRef = useRef(0); curRef.current = cur;
  const end = useRef(null);
  const loadUsers = () => api('/users', {}, auth.token).then(setUsers).catch(() => {});
  useEffect(() => {
    loadUsers();
    const es = new EventSource('/api/stream?token=' + auth.token);
    es.addEventListener('presence', loadUsers);
    es.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      const key = m.to_id === 0 ? 0 : (m.from_id === auth.user.id ? m.to_id : m.from_id);
      setMsgs(p => ({ ...p, [key]: [...(p[key] || []), m] }));
      if (key !== curRef.current && m.from_id !== auth.user.id) setUnread(u => ({ ...u, [key]: (u[key] || 0) + 1 }));
    });
    return () => es.close();
  }, []);
  useEffect(() => {
    api('/messages?with=' + cur, {}, auth.token).then(l => setMsgs(p => ({ ...p, [cur]: l })));
    setUnread(u => ({ ...u, [cur]: 0 }));
  }, [cur]);
  useEffect(() => { end.current && end.current.scrollIntoView(); }, [msgs, cur]);
  const send = async e => {
    e.preventDefault(); const t = text.trim(); if (!t) return; setText('');
    try { await api('/messages', { method: 'POST', body: JSON.stringify({ to: cur, text: t }) }, auth.token); } catch (x) { alert(x.message); }
  };
  const name = cur === 0 ? '🌐 Phòng chung' : (users.find(u => u.id === cur) || {}).username || '';
  const pick = id => { setCur(id); setOpen(true); };
  const fmt = ts => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return html`<div class=${'app' + (open ? ' chat' : '')}>
    <div class="side">
      <header><b>👤 ${auth.user.username}</b><button class="link" onClick=${onLogout}>Đăng xuất</button></header>
      <div class="list">
        <div class=${'item' + (cur === 0 ? ' on' : '')} onClick=${() => pick(0)}>🌐 Phòng chung ${unread[0] ? html`<span class="badge">${unread[0]}</span>` : null}</div>
        ${users.map(u => html`<div key=${u.id} class=${'item' + (cur === u.id ? ' on' : '')} onClick=${() => pick(u.id)}>
          <span class=${'dot' + (u.online ? ' on' : '')}></span>${u.username}
          ${unread[u.id] ? html`<span class="badge">${unread[u.id]}</span>` : null}</div>`)}
      </div>
    </div>
    <div class="main">
      <div class="title"><button class="link back" onClick=${() => setOpen(false)}>←</button>${name}</div>
      <div class="msgs">${(msgs[cur] || []).map(m => html`<div key=${m.id} class=${'m' + (m.from_id === auth.user.id ? ' me' : '')}>
        ${cur === 0 && m.from_id !== auth.user.id ? html`<small>${m.from_name}</small>` : null}${m.text}<small>${fmt(m.ts)}</small></div>`)}<div ref=${end}></div></div>
      <form class="send" onSubmit=${send}><input placeholder="Nhập tin nhắn..." value=${text} onInput=${e => setText(e.target.value)} maxLength="2000" /><button>Gửi</button></form>
    </div></div>`;
}

function App() {
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem('auth')); } catch { return null; } });
  const set = a => { a ? localStorage.setItem('auth', JSON.stringify(a)) : localStorage.removeItem('auth'); setAuth(a); };
  useEffect(() => { if (auth) api('/users', {}, auth.token).catch(() => set(null)); }, []);
  if (!auth) return html`<${Login} onAuth=${set} />`;
  return html`<${Chat} auth=${auth} onLogout=${() => { api('/logout', { method: 'POST' }, auth.token).catch(() => {}); set(null); }} />`;
}
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
