export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const API_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Route not found': 'Rute tidak ditemukan',
  'User not found': 'Pengguna tidak ditemukan',
  'Invalid input': 'Data yang dimasukkan tidak valid',
  'Invalid account settings': 'Pengaturan akun tidak valid',
  'Email is already in use': 'Email sudah digunakan',
  'New password must be between 8 and 128 characters':
    'Kata sandi baru harus terdiri dari 8 hingga 128 karakter',
  'Current password is incorrect': 'Kata sandi saat ini salah',
  'User already exists': 'Pengguna sudah terdaftar',
  'Invalid email or password': 'Email atau kata sandi salah',
  'Missing or invalid token': 'Token tidak tersedia atau tidak valid',
  'Invalid track ID': 'ID jalur tidak valid',
  'Track not found': 'Jalur tidak ditemukan',
  'Invalid lesson ID': 'ID pelajaran tidak valid',
  'Lesson not found': 'Pelajaran tidak ditemukan',
  'Invalid ID': 'ID tidak valid',
  'Part not found': 'Bagian tidak ditemukan',
  'Provide a topic and category, or an owned track and category':
    'Masukkan topik dan kategori, atau pilih jalur milikmu beserta kategorinya',
  'Complete onboarding before generating':
    'Selesaikan proses pengenalan sebelum membuat pelajaran',
  'Free generation quota has been used up':
    'Kuota pembuatan pelajaran gratis telah habis',
  'Category must match the track': 'Kategori harus sesuai dengan jalur',
  'Enable exactly one generation mode':
    'Aktifkan tepat satu mode pembuatan pelajaran',
  'Generation queue unavailable': 'Antrean pembuatan pelajaran tidak tersedia',
  'Invalid job ID': 'ID proses tidak valid',
  'Generation job not found': 'Proses pembuatan pelajaran tidak ditemukan',
  'OpenAI API credits are exhausted. Check API billing and project limits before trying again.':
    'Kredit API OpenAI telah habis. Periksa tagihan API dan batas proyek sebelum mencoba lagi.',
  'OpenAI rate limit reached. Please try again shortly.':
    'Batas permintaan OpenAI tercapai. Silakan coba lagi sebentar lagi.',
  'OpenAI API key was rejected or lacks access. Check the worker configuration.':
    'Kunci API OpenAI ditolak atau tidak memiliki akses. Periksa konfigurasi worker.',
  'OpenAI is temporarily unavailable. Please try again shortly.':
    'OpenAI sedang tidak tersedia. Silakan coba lagi sebentar lagi.',
  'OpenAI rejected the generation request. Check the worker configuration.':
    'OpenAI menolak permintaan pembuatan pelajaran. Periksa konfigurasi worker.',
};

export function translateApiMessage(message: string) {
  return API_MESSAGE_TRANSLATIONS[message] || message;
}

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setAuthToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
  }
}

export function removeAuthToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (
    !headers.has('Content-Type') &&
    options.body instanceof URLSearchParams === false &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message;
    throw new Error(
      (typeof message === 'string' && translateApiMessage(message)) ||
        message ||
        'Terjadi kesalahan',
    );
  }

  return data as T;
}
