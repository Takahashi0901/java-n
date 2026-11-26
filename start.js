'use strict';
// Tự kiểm tra môi trường + chạy kiểm thử tự động, sau đó mới khởi động ứng dụng (chỉ truy cập từ máy này)
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const PORT = Number(process.env.PORT || 3000), HOST = '127.0.0.1';
const fail = m => { console.error('\n✘ ' + m + '\n'); process.exit(1); };
(async () => {
  console.log('=== BƯỚC 1: Kiểm tra môi trường ===');
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 13)) fail(`Cần Node.js >= 22.13 (đang dùng ${process.versions.node}). Tải tại https://nodejs.org`);
  console.log('  ✔ Node.js ' + process.versions.node);
  try { require('node:sqlite'); console.log('  ✔ Module SQLite có sẵn'); } catch { fail('Node.js của bạn không có module node:sqlite. Hãy cập nhật Node.js >= 22.13'); }
  for (const f of ['server.js', 'public/index.html', 'public/app.js']) if (!fs.existsSync(path.join(__dirname, f))) fail('Thiếu file: ' + f); 
  console.log('  ✔ Đủ file mã nguồn');
  await new Promise(r => { const s = net.createServer().once('error', e => fail(`Cổng ${PORT} đang bị chiếm (${e.code}). Thử: PORT=3001 node start.js`)).once('listening', () => s.close(r)).listen(PORT, HOST); });
  console.log('  ✔ Cổng ' + PORT + ' còn trống');
  console.log('\n=== BƯỚC 2: Kiểm thử tự động ===');
  const { runSelfTest } = require('./test');
  const r = await runSelfTest(); console.log(r.report);
  if (r.failed) fail(r.failed + ' kiểm thử thất bại, không khởi động.');
  console.log('\n=== BƯỚC 3: Khởi động ===');
  const { createApp } = require('./server');
  const app = createApp(path.join(__dirname, 'chat.db'));
  app.server.listen(PORT, HOST, () => console.log(`\n✔ Chat đang chạy: http://localhost:${PORT}\n  (mở bằng 2 trình duyệt/2 tab ẩn danh để thử chat giữa 2 người; Ctrl+C để dừng)\n  Lưu ý: giao diện cần Internet để tải React từ CDN.`));
})();
