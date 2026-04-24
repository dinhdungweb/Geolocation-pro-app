# Hướng Dẫn Deploy Lên VPS (Thủ Công - PM2 & Nginx)

Tài liệu này hướng dẫn bạn cách deploy ứng dụng lên VPS mà **không dùng Docker**. Bạn sẽ cài đặt trực tiếp Node.js, Database và Web Server lên hệ điều hành (Ubuntu 20.04/22.04).

## 1. Cài Đặt Môi Trường Cơ Bản

SSH vào VPS và chạy các lệnh sau:

### Cài Node.js (v20)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Cài PostgreSQL
```bash
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
```

### Cài Nginx & Certbot (SSL)
```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

### Cài PM2 (Quản lý Process)
```bash
sudo npm install -g pm2
```

---

## 2. Cấu Hình Database

Tạo user và database mới cho app:

```bash
sudo -u postgres psql
```

Trong giao diện psql:
```sql
CREATE DATABASE geolocation_app;
CREATE USER myuser WITH ENCRYPTED PASSWORD 'mypassword';
GRANT ALL PRIVILEGES ON DATABASE geolocation_app TO myuser;
-- Đối với Postgres 15+ cần grant thêm permission public schema
\c geolocation_app
GRANT ALL ON SCHEMA public TO myuser;
\q
```

---

## 3. Upload Code & Cài Đặt

### Clone Code hoặc Upload
Upload source code lên thư mục (ví dụ `/var/www/geolocation-app`).

```bash
cd /var/www/geolocation-app
```

### Cài Dependencies & Build
```bash
npm install
npm run build
```

### Cấu hình file .env
Tạo file `.env`:
```bash
nano .env
```
Nội dung (thay đổi thông tin thật):
```env
DATABASE_URL="postgresql://myuser:mypassword@localhost:5432/geolocation_app?schema=public"
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=
HOST=https://app.yourdomain.com
SHOPIFY_APP_URL=https://app.yourdomain.com
PORT=3001
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=pbkdf2_sha256$310000$base64_salt$base64_hash
ADMIN_SESSION_SECRET=replace_with_32_plus_random_chars
APP_ENCRYPTION_KEY=replace_with_32_plus_random_chars
MAXMIND_LICENSE_KEY=your_maxmind_license_key
VPN_CHECK_API_URL=http://ip-api.com/json/{ip}?fields=status,message,proxy,hosting,query
```

Generate `ADMIN_PASSWORD_HASH` with a local script or password manager using PBKDF2-SHA256. The format must be `pbkdf2_sha256$iterations$saltBase64$hashBase64` with at least 100000 iterations.

`VPN_CHECK_API_URL` is used only for VPN/proxy/Tor detection. The default example uses ip-api.com's JSON fields `proxy` and `hosting`. For production/commercial usage, check ip-api.com's current terms and consider their Pro HTTPS endpoint.

### Đẩy Database Schema
```bash
npx prisma migrate deploy
```

---

## 4. Chạy Ứng Dụng Với PM2

Mình đã tạo sẵn file `ecosystem.config.cjs` trong code. Bạn chỉ cần chạy:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Lệnh `pm2 startup` sẽ sinh ra một lệnh khác, bạn hãy copy và chạy lệnh đó để PM2 tự khởi động khi reset VPS.

---

## 5. Cấu Hình Nginx & HTTPS

### Tạo Config Nginx
```bash
sudo nano /etc/nginx/sites-available/geolocation-app
```

Dán nội dung sau (thay `app.yourdomain.com` bằng domain của bạn):

```nginx
server {
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Kích hoạt Site
```bash
sudo ln -s /etc/nginx/sites-available/geolocation-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Cài SSL (HTTPS)
```bash
sudo certbot --nginx -d app.yourdomain.com
```

---

## 6. Hoàn Tất

Vào `https://app.yourdomain.com` để kiểm tra.
Đừng quên update lại App URL trong Shopify Dashboard!
