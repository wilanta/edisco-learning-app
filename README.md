# Edisco — Pelajari Apa Saja

Edisco adalah web app pembelajaran mandiri berbasis AI yang mengubah topik pilihan pengguna menjadi pelajaran singkat dan interaktif. Melalui pendekatan **microlearning**, pengguna belajar dalam bagian-bagian kecil, mengerjakan latihan, menerima umpan balik, dan mengikuti kemajuannya secara bertahap.

Pengguna memilih minat serta ritme belajar, lalu memasukkan topik yang ingin dipelajari. Sistem menyiapkan pelajaran dengan tepat lima bagian latihan. Aktivitas belajar menghasilkan poin pengalaman (XP), rangkaian hari belajar, dan posisi dalam liga mingguan.

Antarmuka Edisco menggunakan Bahasa Indonesia, mendukung desktop dan ponsel, serta menyediakan tema terang dan gelap.

## Tujuan Proyek

Edisco membantu pengguna memulai pembelajaran tanpa harus menyusun materi dan mencari latihan sendiri dari awal. Aplikasi ini ditujukan bagi pelajar, mahasiswa, pekerja, dan siapa pun yang ingin mengeksplorasi pengetahuan atau keterampilan baru melalui sesi belajar singkat.

Fokus pengalaman belajarnya adalah menentukan tujuan, berlatih, memahami umpan balik, dan membangun kebiasaan belajar secara konsisten.

## Fitur Utama

| Fitur | Deskripsi |
|---|---|
| Onboarding | Memilih minat dan ritme belajar sebelum memulai. |
| Akun pengguna | Pendaftaran dan masuk menggunakan email serta kata sandi. |
| Jalur belajar | Melihat urutan pelajaran, status penyelesaian, dan kemajuan setiap jalur. |
| Koleksi pelajaran | Menelusuri pelajaran menurut jalur, mencari judul, dan memfilter kategori. |
| Pembuatan pelajaran AI | Menghasilkan pelajaran berdasarkan topik, kategori, dan ritme belajar. |
| Latihan interaktif | Mengerjakan soal dan menerima hasil pemeriksaan beserta penjelasan. |
| Gamifikasi | Mengumpulkan XP, mempertahankan rangkaian hari belajar, dan mengikuti liga mingguan. |
| Profil | Melihat identitas, jumlah pelajaran, penyelesaian, dan statistik belajar. |
| Pengaturan | Mengubah foto profil, email, kata sandi, dan tema tampilan. |

## Pengalaman Belajar

Alur pengguna dimulai dari halaman sambutan, pemilihan minat, pemilihan ritme, lalu pendaftaran atau masuk. Setelah onboarding selesai, pengguna dapat membuat pelajaran dan mengaksesnya melalui menu Jalur atau Pelajaran.

Kategori yang tersedia meliputi Pemrograman, Bahasa, Matematika, Sains, Teknik, dan Umum. Minat membantu mengurutkan saran topik, tetapi tidak membatasi kategori yang boleh dipelajari.

Pilihan ritme berkisar dari 1–3 menit hingga 30+ menit sehari. Backend memetakannya ke tingkat santai (`CASUAL`), reguler (`REGULAR`), dan intensif (`INTENSIVE`). Ritme memengaruhi kompleksitas materi; jumlah bagian tetap lima untuk setiap pelajaran.

Jenis latihan yang didukung:

- Pilihan ganda.
- Benar atau salah.
- Mengisi bagian kosong.
- Mencocokkan pasangan.
- Memprediksi hasil kode.
- Menerjemahkan teks.
- Menjawab pertanyaan singkat.

Jawaban diperiksa oleh API. Pengguna memperoleh umpan balik dan dapat melanjutkan latihan setelah menjawab dengan benar. Pelajaran yang telah dimiliki tetap dapat dibuka kembali untuk belajar ulang.

## Kuota dan Gamifikasi

Pengguna memperoleh tiga kesempatan pembuatan pelajaran setelah onboarding. Pembuatan yang berhasil menggunakan satu kesempatan, termasuk jika sistem menggunakan kembali materi yang cocok. Proses yang gagal tidak mengurangi kuota. Belum tersedia pembelian kuota atau paket langganan.

Aturan poin saat ini memberikan 10 XP untuk bagian yang langsung dijawab benar pada percobaan pertama, atau 5 XP jika baru berhasil setelah percobaan sebelumnya. Penyelesaian pertama seluruh pelajaran memberikan bonus 20 XP. Aktivitas penyelesaian bagian baru pertama pada suatu hari juga memberikan bonus 5 XP.

XP mingguan digunakan untuk menyusun liga. Periode mingguan dimulai pada Senin dengan perhitungan tanggal berbasis UTC. Mengulang bagian yang sudah selesai tidak memberikan XP bagian baru.

## Cara Kerja AI

Pembuatan pelajaran berjalan di latar belakang. Web mengirim permintaan ke API, API menyimpan pekerjaan dan memasukkannya ke antrean, lalu worker memprosesnya. Web memeriksa status secara berkala dan membuka pelajaran ketika hasilnya tersedia.

Sebelum membuat konten baru, worker mencari pelajaran yang cocok menggunakan embedding dan pencarian kemiripan makna di PostgreSQL dengan pgvector. Konten hanya dapat digunakan kembali jika kategori, ritme, konteks, versi, dan masa berlakunya memenuhi syarat.

Jika tidak ada kandidat cocok, worker meminta konten baru melalui OpenAI. Hasilnya divalidasi agar memiliki lima bagian berurutan dengan struktur dan jenis soal yang sesuai. Konten disimpan terpisah dari progres sehingga penggunaan ulang materi tidak mencampurkan hasil belajar antarpengguna.

Masa berlaku penggunaan ulang adalah tiga bulan kalender. Berakhirnya masa tersebut membatasi reuse untuk permintaan berikutnya, bukan menghapus akses pengguna terhadap pelajaran yang sudah dimiliki.

## Teknologi dan Arsitektur

Edisco menggunakan monorepo npm workspaces dengan tiga aplikasi utama dan dua paket bersama.

| Komponen | Teknologi dan peran |
|---|---|
| Web | Next.js, React, TypeScript, Tailwind CSS, dan CSS khusus untuk antarmuka. |
| API | Fastify untuk autentikasi, validasi, data pengguna, progres, dan penilaian jawaban. |
| Worker | Proses Node.js untuk embedding, pencarian reuse, dan generasi pelajaran. |
| Database | PostgreSQL, pgvector, dan Drizzle ORM. |
| Antrean | Redis dan BullMQ untuk mengirim pekerjaan dari API ke worker. |
| AI | OpenAI Responses API dan Embeddings API. |
| Autentikasi | JWT untuk permintaan API dan bcrypt untuk hash kata sandi. |
| Infrastruktur lokal | Docker Compose untuk PostgreSQL dan Redis. |

```text
Browser / Web
      │
      ▼
API Fastify ───────────────► PostgreSQL + pgvector
      │                            ▲
      ▼                            │
Redis / BullMQ ─────────────► Worker
                                   │
                                   ▼
                               OpenAI API
```

Kunci API provider digunakan di worker. Browser mengakses layanan melalui API aplikasi dan tidak terhubung langsung ke database atau provider AI.

## Struktur Proyek

```text
apps/
  web/                 Antarmuka dan halaman aplikasi
  api/                 REST API dan migrasi database
  worker/              Pemrosesan pelajaran di latar belakang
packages/
  database/            Schema dan koneksi database bersama
  shared-types/        Tipe data lintas aplikasi
infra/
  postgres/            Inisialisasi ekstensi database
tests/                 Pengujian dan fixture
compose.yaml           Konfigurasi PostgreSQL dan Redis lokal
howtostart.md          Panduan menjalankan aplikasi
```

Data utama mencakup pengguna, jalur, pelajaran, bagian latihan, penugasan pelajaran, progres jawaban, pekerjaan generasi, dan entri liga mingguan.

## Menjalankan Proyek

Lingkungan pengembangan menggunakan WSL Ubuntu-24.04, Node.js 22.20.x, npm 11.x, serta Docker. Siapkan konfigurasi database, Redis, JWT, dan mode generasi sebelum menjalankan layanan.

Dari root repository, instal dependensi, jalankan infrastruktur, bangun paket database, dan terapkan migrasi:

```bash
npm ci
npm run infra:up
npm run build --workspace @edisco/database
npm run db:migrate
```

Jalankan masing-masing aplikasi pada terminal terpisah:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

Web secara default tersedia di `http://localhost:3000` dan API di `http://localhost:3001`. Worker berjalan tanpa endpoint HTTP.

Panduan lengkap tersedia di [howtostart.md](../howtostart.md). File env, termasuk `.env.example`, diabaikan Git sehingga konfigurasi lokal perlu disiapkan sendiri pada clone baru.

## Status dan Batasan

Fondasi fitur utama sudah tersedia, termasuk onboarding, autentikasi, latihan interaktif, generasi AI, reuse konten, gamifikasi, dan pengaturan akun. Beberapa bagian masih memerlukan penyempurnaan:

- Mode placeholder hanya menguji alur antrean dan tidak menghasilkan materi pelajaran.
- Backend mendukung kelanjutan jalur melalui `trackId`, tetapi tombol pelajaran berikutnya belum meneruskan konteks tersebut ke formulir pembuatan.
- Pemeriksaan jawaban teks masih memakai pencocokan string, sehingga variasi jawaban yang maknanya setara belum otomatis diterima.
- Antarmuka sudah menggunakan Bahasa Indonesia, tetapi bahasa keluaran materi AI belum dipaksa melalui instruksi generator.
- Saran topik masih berbasis daftar statis dan pencocokan teks sederhana.
- Grid aktivitas profil belum ditampilkan; perubahan minat dan ritme belum tersedia dalam formulir pengaturan saat ini.

Generasi materi nyata membutuhkan konfigurasi OpenAI yang valid dan kredit provider yang tersedia. Validasi struktur keluaran AI tidak menjamin kebenaran seluruh isi materi. Penjelasan teknis lebih lengkap tersedia di [deskripsi.md](../deskripsi.md), jika dokumen lokal tersebut tersedia.
