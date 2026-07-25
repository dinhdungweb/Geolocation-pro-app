# GeoPro — Geo Redirect & Country Blocker

GeoPro là ứng dụng Shopify embedded giúp cửa hàng điều hướng, hiển thị popup hoặc chặn khách truy cập theo vị trí địa lý và địa chỉ IP. Ứng dụng có dashboard thống kê, visitor logs, billing theo usage, trang quản trị nội bộ và các worker xử lý nền.

## Tính năng chính

- Tạo rule theo quốc gia, bang/tỉnh và Shopify Market.
- Hỗ trợ popup gợi ý, tự động redirect và trang chặn tùy chỉnh.
- Tạo allow/block rule cho từng IP hoặc dải IP.
- Phát hiện VPN/proxy/hosting khi được cấu hình.
- Theme app embed để chạy logic trên storefront.
- App Proxy có xác thực chữ ký cho config và analytics.
- Dashboard thống kê lượt truy cập, redirect, popup và block.
- Visitor logs có lọc, tìm kiếm và lưu vùng địa lý.
- Shopify billing, usage limit, overage và email cảnh báo.
- Webhook uninstall, scope update, subscription update và GDPR.
- Admin portal quản lý shop, billing và email automation.

## Công nghệ

- Node.js, TypeScript và React 18
- Shopify App Remix, App Bridge và Polaris
- PostgreSQL với Prisma
- Vite và Vitest
- PM2 và Nginx cho production
- MaxMind GeoLite2 cho tra cứu GeoIP

## Yêu cầu

- Node.js tương thích với `package.json` (khuyến nghị Node.js 20)
- PostgreSQL
- Shopify CLI
- Shopify Partner account và development store
- MaxMind license key nếu muốn tự động cập nhật GeoLite2

## Cài đặt local

```bash
git clone https://github.com/dinhdungweb/Geolocation-pro-app.git
cd Geolocation-pro-app
npm ci
```

Tạo file môi trường:

```bash
cp .env.example .env
```

Điền tối thiểu các biến sau:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/geolocation_app?schema=public
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-tunnel-or-domain.example
SCOPES=read_markets,read_themes
```

Khởi tạo database:

```bash
npm run setup:dev
```

Chạy ứng dụng qua Shopify CLI:

```bash
npm run dev
```

Không commit `.env`, database dump, credential hoặc API token vào Git.

## Biến môi trường

File [.env.example](./.env.example) chứa toàn bộ cấu hình mẫu. Các nhóm quan trọng:

| Biến | Bắt buộc | Mục đích |
| --- | --- | --- |
| `DATABASE_URL` | Có | Kết nối PostgreSQL |
| `SHOPIFY_API_KEY` | Có | Client ID của Shopify app |
| `SHOPIFY_API_SECRET` | Có | Xác thực Shopify và ký analytics token |
| `SHOPIFY_APP_URL` | Có | URL HTTPS công khai của app |
| `SCOPES` | Có | Shopify access scopes |
| `ADMIN_USERNAME` | Production | Tài khoản admin nội bộ |
| `ADMIN_PASSWORD_HASH` | Production | PBKDF2-SHA256 hash, tối thiểu 100.000 vòng |
| `ADMIN_SESSION_SECRET` | Production | Khóa ký admin session |
| `APP_ENCRYPTION_KEY` | Production | Khóa mã hóa secret lưu trong database |
| `MAXMIND_LICENSE_KEY` | Khuyến nghị | Tự động tải/cập nhật GeoLite2 |
| `VPN_CHECK_API_URL` | Tùy chọn | Provider phát hiện VPN/proxy |
| `RESEND_API_KEY` | Tùy chọn | Gửi email qua Resend |
| `ALERT_WEBHOOK_URL` | Tùy chọn | Slack-compatible webhook nhận cảnh báo health |

Trong production, đặt `SHOPIFY_BILLING_TEST=false`. Không bật đồng thời `ENABLE_IN_APP_CRON=true` khi `geo-billing-worker` đang chạy.

## Các lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy local qua Shopify CLI |
| `npm run build` | Generate Prisma client và build web + worker |
| `npm run start` | Chạy production web server |
| `npm run worker:billing` | Chạy billing/cleanup worker |
| `npm test` | Chạy unit test |
| `npm run test:coverage` | Chạy unit test và coverage gate |
| `npm run test:integration` | Chạy test với PostgreSQL schema riêng |
| `npm run verify` | Coverage, lint, typecheck và build |
| `npm run verify:all` | `verify` và integration test |
| `npm run ops:backup` | Tạo PostgreSQL custom-format backup |
| `npm run ops:healthcheck` | Kiểm tra web + database và gửi cảnh báo |

## Integration test

Integration test bắt buộc dùng PostgreSQL schema riêng, không được dùng schema `public`.

```bash
cp .env.test.example .env.test
npm run test:integration
```

Runner sẽ từ chối chạy nếu:

- `TEST_DATABASE_URL` trùng `DATABASE_URL`;
- schema là `public`;
- tên schema không chứa `test` hoặc `integration`;
- URL không phải PostgreSQL.

## Storefront và Shopify

Sau khi cài app vào development store:

1. Mở theme editor.
2. Bật app embed `geolocation-popup`.
3. Tạo ít nhất một geolocation rule hoặc IP rule.
4. Mở storefront và kiểm tra hành động.
5. Xác nhận dữ liệu xuất hiện trong Visitor Logs.

Các endpoint chính:

- App Proxy: `/proxy/config` và `/proxy/analytics`
- Webhooks: `/webhooks/app/uninstalled`, `/webhooks/app/scopes_update`, `/webhooks/app/subscriptions/update`, `/webhooks/app/gdpr`
- Health check: `/healthz`

Thay đổi `shopify.app.toml`, webhook subscription hoặc extension cần chạy:

```bash
npm run deploy
```

Thay đổi code web/worker thông thường chỉ cần deploy lại server.

## Production

Hướng dẫn cài mới, cập nhật, rollback, backup và monitoring nằm tại [DEPLOY_MANUAL.md](./DEPLOY_MANUAL.md).

Quy trình release tối thiểu:

```bash
npm ci
npm run verify:all
git pull origin main
npm ci
npx prisma migrate deploy
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

Luôn backup database trước migration. Sau deploy, kiểm tra `/healthz`, `pm2 status`, log web/worker và smoke test trên development store trước khi xác nhận release.

## Cấu trúc chính

```text
app/
  routes/                  Shopify UI, App Proxy, webhooks và admin
  utils/                   billing, analytics, cleanup, GeoIP và security
  worker.billing.server.ts background worker entry
extensions/
  geolocation-popup/       theme app extension
prisma/
  migrations/              PostgreSQL migrations
  schema.prisma            data model
scripts/
  backup-postgres.mjs      database backup
  healthcheck.mjs          health monitoring và alert
test/integration/          PostgreSQL integration tests
```

## Bảo mật và vận hành

- Chỉ phục vụ app qua HTTPS.
- Giữ `SHOPIFY_API_SECRET`, `APP_ENCRYPTION_KEY` và admin secrets ngoài Git.
- Không dùng production database cho integration test.
- Giới hạn quyền truy cập `/admin` và thay credential định kỳ.
- Lưu bản backup ở vị trí khác VPS hoặc đồng bộ sang object storage.
- Kiểm tra định kỳ khả năng restore; file backup chưa được thử restore thì chưa được xem là backup hoàn chỉnh.
