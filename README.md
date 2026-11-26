# ĐỒ ÁN: PHẦN MỀM CHAT ONLINE
Môn: Điện toán di động — Công nghệ: **React (frontend) + Node.js (backend) + SQLite (CSDL)**, thời gian thực bằng **Server-Sent Events (SSE)**.

## 1. Chức năng
| # | Chức năng | Mô tả |
|---|-----------|-------|
| 1 | Đăng ký | Tên đăng nhập 3–20 ký tự, mật khẩu ≥ 6 ký tự, chặn trùng tên |
| 2 | Đăng nhập / Đăng xuất | Mật khẩu băm scrypt + salt, phiên đăng nhập bằng token |
| 3 | Chat nhóm | Phòng chung cho mọi người dùng |
| 4 | Chat riêng 1–1 | Nhắn tin trực tiếp giữa hai người |
| 5 | Thời gian thực | Tin nhắn đến ngay, không cần tải lại trang |
| 6 | Trạng thái online | Chấm xanh khi người dùng đang kết nối |
| 7 | Tin nhắn chưa đọc | Huy hiệu số tin mới trên từng cuộc trò chuyện |
| 8 | Lưu lịch sử | Lưu SQLite, tải lại 200 tin gần nhất khi mở cuộc trò chuyện |
| 9 | Giao diện responsive | Dùng được trên màn hình điện thoại (danh sách ↔ khung chat) |
| 10 | Tự kiểm tra | 14 kiểm thử tự động chạy trước mỗi lần khởi động |

## 2. Kiến trúc
```
Trình duyệt (React) ──HTTP REST──► Node.js (server.js) ──► SQLite (chat.db)
        ▲                                   │
        └────────── SSE /api/stream ◄───────┘   (đẩy tin nhắn & trạng thái online)
```
Server chỉ lắng nghe `127.0.0.1` → **chỉ chạy trên máy cá nhân**.

## 3. CSDL (SQLite)
- `users(id, username UNIQUE, salt, hash)`
- `sessions(token PK, user_id)`
- `messages(id, from_id, to_id, text, ts)` — `to_id = 0` là phòng chung

## 4. API
`POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/users`,
`GET /api/messages?with=<id|0>`, `POST /api/messages {to,text}`, `GET /api/stream` (SSE).

## 5. Cách chạy
1. Cài **Node.js ≥ 22.13** (https://nodejs.org). Không cần `npm install` (không có thư viện ngoài).
2. Mở terminal trong thư mục dự án: `node --no-warnings start.js` (hoặc nhấp đúp `start.bat` trên Windows, `./start.sh` trên macOS/Linux).
3. Chương trình tự: kiểm tra môi trường → chạy kiểm thử → khởi động.
4. Mở http://localhost:3000. Mở thêm tab ẩn danh, đăng ký 2 tài khoản để thử chat.

Đổi cổng: `PORT=3001 node start.js` (Windows PowerShell: `$env:PORT=3001; node start.js`).
Chạy riêng kiểm thử: `node --no-warnings test.js`.
> Giao diện tải React từ CDN nên máy cần có Internet khi mở trang.

## 6. Bảo mật
Băm mật khẩu scrypt + salt ngẫu nhiên; truy vấn SQL có tham số hóa (chống SQL injection); React tự escape nội dung (chống XSS); chặn truy cập file ngoài `public/`; giới hạn kích thước request và độ dài tin nhắn.

## 7. Hướng phát triển
Gửi ảnh/file, nhóm chat tùy chọn, thông báo đẩy, đóng gói thành app di động (React Native/Capacitor).
