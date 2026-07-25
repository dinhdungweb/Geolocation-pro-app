# Hướng dẫn deploy GeoPro lên VPS

Tài liệu này dùng cho Ubuntu, PostgreSQL, PM2 và Nginx. Production gồm hai tiến trình:

- `geo-redirect-country-blocker`: web server;
- `geo-billing-worker`: billing, email, cleanup và các job định kỳ.

## 1. Chuẩn bị máy chủ

Cài Node.js 20, PostgreSQL client/server, Nginx, Certbot và PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y nodejs postgresql postgresql-contrib postgresql-client nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

Xác nhận phiên bản:

```bash
node --version
npm --version
psql --version
pm2 --version
```

## 2. Tạo PostgreSQL database

```bash
sudo -u postgres psql
```

```sql
CREATE USER geopro WITH ENCRYPTED PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE geolocation_app OWNER geopro;
\c geolocation_app
GRANT ALL ON SCHEMA public TO geopro;
\q
```

Chỉ cho PostgreSQL lắng nghe trên interface cần thiết và giới hạn firewall. Không public cổng `5432` nếu app và database cùng VPS.

## 3. Cài ứng dụng lần đầu

```bash
sudo mkdir -p /var/www/geolocation-app
sudo chown "$USER":"$USER" /var/www/geolocation-app
git clone https://github.com/dinhdungweb/Geolocation-pro-app.git /var/www/geolocation-app
cd /var/www/geolocation-app
npm ci
cp .env.example .env
nano .env
```

Cấu hình tối thiểu:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://geopro:strong_password@127.0.0.1:5432/geolocation_app?schema=public
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://app.example.com
SCOPES=read_markets,read_themes
SHOPIFY_BILLING_TEST=false

ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=pbkdf2_sha256$310000$base64_salt$base64_hash
ADMIN_SESSION_SECRET=replace_with_at_least_32_random_characters
APP_ENCRYPTION_KEY=replace_with_at_least_32_random_characters

MAXMIND_LICENSE_KEY=your_maxmind_license_key
VPN_CHECK_API_URL=
RESEND_API_KEY=
SENDER_EMAIL=

DISABLE_IN_APP_CRON=true
ENABLE_IN_APP_CRON=false
```

`ADMIN_PASSWORD_HASH` phải có dạng `pbkdf2_sha256$iterations$saltBase64$hashBase64` và tối thiểu 100.000 vòng. Dùng password manager hoặc script offline đáng tin cậy để sinh hash.

Tạo hai secret ngẫu nhiên riêng biệt:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Phân quyền file môi trường:

```bash
chmod 600 .env
```

Chạy migration, verify và build:

```bash
npx prisma migrate deploy
npm run verify
```

Khởi động PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Chạy lệnh mà `pm2 startup` in ra, sau đó kiểm tra:

```bash
pm2 status
pm2 logs --lines 100
curl --fail http://127.0.0.1:3001/healthz
```

## 4. Nginx và HTTPS

Tạo `/etc/nginx/sites-available/geopro`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Kích hoạt site và SSL:

```bash
sudo ln -s /etc/nginx/sites-available/geopro /etc/nginx/sites-enabled/geopro
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com
```

Kiểm tra public endpoint:

```bash
curl --fail https://app.example.com/healthz
```

Cập nhật App URL, redirect URL và App Proxy URL trong Shopify Partner Dashboard. Nếu `shopify.app.toml` là nguồn cấu hình đang dùng, chạy `npm run deploy` từ máy đã đăng nhập Shopify CLI.

## 5. Backup PostgreSQL tự động

Runner `npm run ops:backup` sử dụng `pg_dump`, tạo custom-format dump và xóa backup cũ theo retention.

Thêm vào `.env`:

```env
BACKUP_DIR=/var/backups/geopro/postgres
BACKUP_RETENTION_DAYS=14
```

Tạo thư mục và thử backup:

```bash
sudo mkdir -p /var/backups/geopro/postgres
sudo chown "$USER":"$USER" /var/backups/geopro/postgres
cd /var/www/geolocation-app
npm run ops:backup
pg_restore --list /var/backups/geopro/postgres/postgres-*.dump | head
```

Tạo log directory:

```bash
sudo mkdir -p /var/log/geopro
sudo chown "$USER":"$USER" /var/log/geopro
```

Mở crontab bằng `crontab -e` và backup mỗi ngày lúc 02:15:

```cron
15 2 * * * cd /var/www/geolocation-app && /usr/bin/npm run ops:backup >> /var/log/geopro/backup.log 2>&1
```

Nên đồng bộ dump sang object storage hoặc máy khác. Backup nằm cùng VPS không bảo vệ được khi VPS hoặc disk hỏng.

Thử restore định kỳ vào database riêng:

```bash
createdb geolocation_restore_test
pg_restore --clean --if-exists --no-owner --dbname geolocation_restore_test /path/to/postgres-backup.dump
psql geolocation_restore_test -c '\dt'
dropdb geolocation_restore_test
```

Không chạy lệnh restore thử nghiệm vào production database.

## 6. Health check và cảnh báo

Endpoint `/healthz` trả `200` khi web và database hoạt động, hoặc `503` khi database không truy cập được.

Thêm vào `.env`:

```env
HEALTHCHECK_URL=https://app.example.com/healthz
HEALTHCHECK_TIMEOUT_MS=10000
HEALTHCHECK_FAILURE_THRESHOLD=2
HEALTHCHECK_STATE_FILE=/var/lib/geopro/healthcheck-state.json
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/replace/me
```

Webhook phải chấp nhận payload JSON kiểu Slack với trường `text`. Nếu chưa cấu hình webhook, runner vẫn log lỗi nhưng không gửi cảnh báo.

Tạo state directory:

```bash
sudo mkdir -p /var/lib/geopro
sudo chown "$USER":"$USER" /var/lib/geopro
```

Chạy thử:

```bash
cd /var/www/geolocation-app
npm run ops:healthcheck
```

Thêm health check mỗi 5 phút:

```cron
*/5 * * * * cd /var/www/geolocation-app && /usr/bin/npm run ops:healthcheck >> /var/log/geopro/healthcheck.log 2>&1
```

Runner chỉ gửi một cảnh báo DOWN sau số lần lỗi liên tiếp đã cấu hình và gửi một thông báo RECOVERED khi hệ thống hoạt động trở lại.

PM2 đã được cấu hình tự restart web và worker với delay để tránh restart loop quá nhanh.

## 7. Cập nhật phiên bản

Backup trước khi chạy migration:

```bash
cd /var/www/geolocation-app
npm run ops:backup
```

Cập nhật:

```bash
git fetch origin
git pull --ff-only origin main
npm ci
npx prisma migrate deploy
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

Kiểm tra sau deploy:

```bash
pm2 status
curl --fail https://app.example.com/healthz
pm2 logs geo-redirect-country-blocker --lines 100
pm2 logs geo-billing-worker --lines 100
```

Smoke test Shopify:

1. Mở embedded app.
2. Tạo hoặc cập nhật một geolocation rule.
3. Kiểm tra redirect, popup hoặc block trên storefront.
4. Xác nhận Visitor Logs và analytics được ghi nhận.
5. Kiểm tra App Proxy và webhook trong log.

## 8. Rollback

Liệt kê release tag:

```bash
git tag --sort=-version:refname
```

Checkout tag cần rollback, cài lại dependency và build:

```bash
git checkout vX.Y.Z
npm ci
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

Không tự động rollback database migration. Nếu release có migration không tương thích, cần có kế hoạch restore hoặc forward-fix riêng trước khi deploy.

Quay lại nhánh chính:

```bash
git checkout main
git pull --ff-only origin main
```

## 9. Checklist release

- [ ] Database đã backup và dump đọc được bằng `pg_restore --list`.
- [ ] `npm run verify:all` pass ở môi trường kiểm thử.
- [ ] Migration hoàn tất.
- [ ] Web và billing worker đều `online`.
- [ ] `/healthz` trả `{"status":"ok"}`.
- [ ] Nginx và HTTPS hoạt động.
- [ ] Embedded app và storefront smoke test pass.
- [ ] Visitor Logs/analytics ghi nhận dữ liệu.
- [ ] Health alert đã được thử ít nhất một lần.
- [ ] Release tag đã được push.
