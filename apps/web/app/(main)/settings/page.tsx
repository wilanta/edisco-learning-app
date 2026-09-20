'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { UserAvatar } from '@/components/user-avatar';
import { apiFetch } from '@/lib/api-client';
import { storeTheme, type ThemePreference } from '@/lib/theme';

type Notice = { kind: 'success' | 'error'; text: string } | null;

async function resizeAvatar(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Pilih gambar JPEG, PNG, atau WebP.');
  }
  if (file.size > 5_000_000) {
    throw new Error('Ukuran gambar asli harus kurang dari 5 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error('Tidak dapat membaca gambar tersebut.'));
      element.src = objectUrl;
    });
    const size = 512;
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Pemrosesan gambar tidak tersedia.');
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      size,
      size,
    );
    const result = canvas.toDataURL('image/jpeg', 0.84);
    if (result.length > 500_000) {
      throw new Error('Ukuran gambar hasil pemrosesan masih terlalu besar.');
    }
    return result;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function StatusNotice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div className={`alert ${notice.kind}`} role="status">
      {notice.text}
    </div>
  );
}

export default function SettingsPage() {
  const { user, refreshUser } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [theme, setTheme] = useState<ThemePreference>('LIGHT');
  const [photoNotice, setPhotoNotice] = useState<Notice>(null);
  const [emailNotice, setEmailNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [themeNotice, setThemeNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setAvatarUrl(user.avatarUrl);
    setEmail(user.email);
    setTheme(user.theme);
  }, [user]);

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoNotice(null);
    try {
      setAvatarUrl(await resizeAvatar(file));
    } catch (error) {
      setPhotoNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Tidak dapat membaca gambar.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const savePhoto = async (nextAvatar: string | null = avatarUrl) => {
    setSaving('photo');
    setPhotoNotice(null);
    try {
      await apiFetch('/users/me/account', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: nextAvatar }),
      });
      setAvatarUrl(nextAvatar);
      await refreshUser();
      setPhotoNotice({
        kind: 'success',
        text: nextAvatar ? 'Foto profil diperbarui.' : 'Foto profil dihapus.',
      });
    } catch (error) {
      setPhotoNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Tidak dapat menyimpan foto.',
      });
    } finally {
      setSaving(null);
    }
  };

  const saveEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving('email');
    setEmailNotice(null);
    try {
      await apiFetch('/users/me/account', {
        method: 'PATCH',
        body: JSON.stringify({ email }),
      });
      await refreshUser();
      setEmailNotice({ kind: 'success', text: 'Alamat email diperbarui.' });
    } catch (error) {
      setEmailNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Tidak dapat memperbarui email.',
      });
    } finally {
      setSaving(null);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordNotice(null);
    if (newPassword !== confirmPassword) {
      setPasswordNotice({
        kind: 'error',
        text: 'Kata sandi baru tidak cocok.',
      });
      return;
    }
    setSaving('password');
    try {
      await apiFetch('/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ kind: 'success', text: 'Kata sandi diperbarui.' });
    } catch (error) {
      setPasswordNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Tidak dapat memperbarui kata sandi.',
      });
    } finally {
      setSaving(null);
    }
  };

  const updateTheme = async (nextTheme: ThemePreference) => {
    const previousTheme = theme;
    setTheme(nextTheme);
    storeTheme(nextTheme);
    setSaving('theme');
    setThemeNotice(null);
    try {
      await apiFetch('/users/me/account', {
        method: 'PATCH',
        body: JSON.stringify({ theme: nextTheme }),
      });
      await refreshUser();
      setThemeNotice({
        kind: 'success',
        text: 'Preferensi tampilan disimpan.',
      });
    } catch (error) {
      setTheme(previousTheme);
      storeTheme(previousTheme);
      setThemeNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Tidak dapat menyimpan tema.',
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="settings-page page-wrap">
      <header className="settings-heading">
        <div>
          <span className="settings-eyebrow">Preferensi akun</span>
          <h1 className="page-title">Pengaturan</h1>
          <p className="page-subtitle">
            Kelola identitas, keamanan, dan tampilanmu.
          </p>
        </div>
        <Icon name="settings" />
      </header>

      <div className="settings-sections">
        <section className="settings-section surface">
          <header>
            <span>
              <Icon name="camera" />
            </span>
            <div>
              <h2>Foto profil</h2>
              <p>Ditampilkan di profil dan menu akunmu.</p>
            </div>
          </header>
          <div className="photo-setting">
            <UserAvatar
              className="settings-avatar"
              name={user?.name}
              avatarUrl={avatarUrl}
            />
            <div>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => choosePhoto(event.target.files?.[0])}
              />
              <div className="settings-button-row">
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Pilih foto
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving === 'photo' || avatarUrl === user?.avatarUrl}
                  onClick={() => savePhoto()}
                >
                  {saving === 'photo' ? 'Menyimpan…' : 'Simpan foto'}
                </button>
                {user?.avatarUrl && (
                  <button
                    type="button"
                    className="text-button danger-text"
                    disabled={saving === 'photo'}
                    onClick={() => savePhoto(null)}
                  >
                    Hapus
                  </button>
                )}
              </div>
              <small>JPEG, PNG, atau WebP. Ukuran sumber maksimal 5 MB.</small>
            </div>
          </div>
          <StatusNotice notice={photoNotice} />
        </section>

        <section className="settings-section surface">
          <header>
            <span>
              <Icon name="mail" />
            </span>
            <div>
              <h2>Alamat email</h2>
              <p>Gunakan alamat ini saat kamu masuk berikutnya.</p>
            </div>
          </header>
          <form className="settings-form" onSubmit={saveEmail}>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={saving === 'email' || email === user?.email}
            >
              {saving === 'email' ? 'Menyimpan…' : 'Perbarui email'}
            </button>
          </form>
          <StatusNotice notice={emailNotice} />
        </section>

        <section className="settings-section surface">
          <header>
            <span>
              <Icon name="key" />
            </span>
            <div>
              <h2>Kata sandi</h2>
              <p>Konfirmasi kata sandi saat ini sebelum memilih yang baru.</p>
            </div>
          </header>
          <form className="settings-form password-form" onSubmit={savePassword}>
            <label>
              Kata sandi saat ini
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              Kata sandi baru
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Konfirmasi kata sandi baru
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={saving === 'password'}
            >
              {saving === 'password' ? 'Memperbarui…' : 'Perbarui kata sandi'}
            </button>
          </form>
          <StatusNotice notice={passwordNotice} />
        </section>

        <section className="settings-section surface">
          <header>
            <span>
              <Icon name="moon" />
            </span>
            <div>
              <h2>Tampilan</h2>
              <p>Pilih tema yang paling nyaman untuk matamu.</p>
            </div>
          </header>
          <fieldset className="theme-options" aria-label="Tema warna">
            <button
              type="button"
              className={theme === 'LIGHT' ? 'selected' : ''}
              aria-pressed={theme === 'LIGHT'}
              disabled={saving === 'theme'}
              onClick={() => updateTheme('LIGHT')}
            >
              <span className="theme-preview theme-preview-light">
                <i />
              </span>
              <strong>
                <Icon name="sun" /> Terang
              </strong>
            </button>
            <button
              type="button"
              className={theme === 'DARK' ? 'selected' : ''}
              aria-pressed={theme === 'DARK'}
              disabled={saving === 'theme'}
              onClick={() => updateTheme('DARK')}
            >
              <span className="theme-preview theme-preview-dark">
                <i />
              </span>
              <strong>
                <Icon name="moon" /> Gelap
              </strong>
            </button>
          </fieldset>
          <StatusNotice notice={themeNotice} />
        </section>
      </div>
    </div>
  );
}
