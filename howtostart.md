# Edisco — Run Locally (WSL Ubuntu-24.04)

Tutorial menjalankan seluruh aplikasi di localhost dari WSL Ubuntu-24.04.

---

## Prasyarat

| Item | Versi | Cara Cek |
|------|-------|----------|
| WSL | Ubuntu-24.04 | `wsl -l -v` |
| Docker | Tersedia di WSL | `wsl -d Ubuntu-24.04 -- docker compose version` |
| Node.js | 22.20.x | `wsl -d Ubuntu-24.04 -- bash -ic 'node --version'` |
| npm | 11.x | `wsl -d Ubuntu-24.04 -- bash -ic 'npm --version'` |

> **PENTING**: Semua perintah harus dijalankan dari **dalam WSL**, bukan dari PowerShell/CMD.

---

## 1. Install dependensi

Dari root repository:

```bash
cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app
npm install
```

Verifikasi:
```bash
ls node_modules/.bin/next
ls node_modules/.bin/tsx
```

---

## 2. Konfigurasi .env

Pastikan `.env` sudah ada di root project (sudah ada di repo ini):

```bash
cp .env.example .env   # jika belum ada
```

Isi minimal:
```env
HOST=127.0.0.1
PORT=3001
REDIS_URL=redis://127.0.0.1:6379
POSTGRES_USER=edisco
POSTGRES_PASSWORD=edisco_local_only
POSTGRES_DB=edisco
DATABASE_URL=postgresql://edisco:edisco_local_only@127.0.0.1:5432/edisco
POSTGRES_PORT=5432
JWT_SECRET=dev-secret-change-in-production-2024
GENERATION_PLACEHOLDER_ENABLED=true
GENERATION_LLM_ENABLED=false
```

> Untuk mode LLM sungguhan, set `GENERATION_LLM_ENABLED=true` dan tambahkan `OPENAI_API_KEY`.

---

## 3. Nyalakan database & cache (Docker)

```bash
wsl -d Ubuntu-24.04 -- docker compose up -d --wait
```

Verifikasi:
```bash
wsl -d Ubuntu-24.04 -- docker ps --format '{{.Names}}: {{.Status}}'
# Harus muncul:
# edisco-postgres-1: Up (healthy)
# edisco-redis-1:    Up (healthy)
```

---

## 4. Jalankan migrasi database

```bash
wsl -d Ubuntu-24.04 -- bash -ic 'cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app && npm run db:migrate'
```

Output yang diharapkan:
```
[✓] migrations applied successfully!
```

---

## 5. Jalankan tiga aplikasi

Buka **tiga terminal WSL terpisah** di root repo.

### Terminal 1 — Web (Next.js)

```bash
wsl -d Ubuntu-24.04 -- bash -ic 'cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app && npm run dev:web'
```

Tunggu muncul:
```
▲ Next.js 16.3.5 (Turbopack)
- Local:         http://localhost:3000
✓ Ready in XXs
```

Akses: `http://localhost:3000`

> ⚠️ Jika port 3000 sudah dipakai, Next.js akan otomatis pakai port berikutnya (cth: 3002).

### Terminal 2 — API (Fastify)

```bash
wsl -d Ubuntu-24.04 -- bash -ic 'cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app && npm run dev:api'
```

Tunggu muncul:
```
{"level":30,"msg":"Server listening at http://127.0.0.1:3001"}
```

Verifikasi:
```bash
curl http://127.0.0.1:3001/health
# {"status":"ok","service":"api"}
```

### Terminal 3 — Worker (BullMQ)

```bash
wsl -d Ubuntu-24.04 -- bash -ic 'cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app && npm run dev:worker'
```

Tunggu muncul:
```
{ status: 'ok', service: 'worker' }
```

Worker tidak punya HTTP listener. Biarkan terminal ini tetap berjalan.

---

## 6. Verifikasi lengkap

```bash
# Web
curl -s http://localhost:3000 | head -5

# API health
curl -s http://127.0.0.1:3001/health

# Database
wsl -d Ubuntu-24.04 -- bash -ic 'cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app && npm run test:database'

# Docker containers
wsl -d Ubuntu-24.04 -- docker ps --format '{{.Names}}: {{.Status}}'
```

Semua harus respond dengan sukses.

---

## Hentikan semua layanan

Di masing-masing terminal tekan **Ctrl+C**.

Untuk menghentikan container Docker:
```bash
wsl -d Ubuntu-24.04 -- docker compose down
```

Data PostgreSQL dan Redis tetap tersimpan di named volume.

---

## Ringkasan cepat (semua dalam WSL)

```bash
wsl -d Ubuntu-24.04 -- bash -ic '
  cd /mnt/c/Users/sheil/OneDrive/Dokumen/Wildhan/projects/edisco-learning-app

  # 1. Install dependencies (sekali saja)
  npm install

  # 2. Setup .env (sekali saja)
  [ -f .env ] || cp .env.example .env

  # 3. Nyalakan infra
  docker compose up -d --wait

  # 4. Migrasi database
  npm run db:migrate
'
```

Kemudian buka 3 terminal WSL terpisah untuk menjalankan web, api, dan worker (lihat langkah 5 di atas).

---

## Troubleshooting

### `Docker: command not found` di WSL
Pastikan Docker Desktop terinstall di Windows, lalu restart WSL:
```powershell
wsl --shutdown
wsl -d Ubuntu-24.04
```

### `port 3000 is in use`
Port 3000 sudah dipakai proses lain (mungkin aplikasi sebelumnya). Next.js otomatis pindah ke port berikutnya (3001, 3002, dst). Akses lewat port yang ditawarkan.

### `npm error: Cannot find module 'tsx'`
Pastikan menjalankan `npm install` di dalam WSL, bukan dari Windows PowerShell. Node.js harus berjalan dari WSL.

### `ECONNREFUSED` saat akses API
Pastikan container Docker sudah healthy:
```bash
wsl -d Ubuntu-24.04 -- docker ps --format '{{.Names}}: {{.Status}}'
```

### Worker error: `Enable exactly one generation mode`
Kedua flag generation aktif di `.env`. Pastikan hanya satu yang `true`:
```env
GENERATION_PLACEHOLDER_ENABLED=true
GENERATION_LLM_ENABLED=false
```
