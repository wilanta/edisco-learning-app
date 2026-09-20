'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import {
  BrandIllustration,
  OnboardingFrame,
  PreparationScreen,
} from '@/components/onboarding-ui';
import { apiFetch, setAuthToken } from '@/lib/api-client';
import {
  clearOnboardingDraft,
  getOnboardingDraft,
} from '@/lib/onboarding-draft';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    const draft = getOnboardingDraft();
    if (!draft.interests?.length || !draft.pace) router.replace('/welcome');
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setAuthToken(result.token);
      const draft = getOnboardingDraft();
      await apiFetch('/users/me/onboarding', {
        method: 'PATCH',
        body: JSON.stringify({ interests: draft.interests, pace: draft.pace }),
      });
      clearOnboardingDraft();
      setPreparing(true);
      window.setTimeout(() => router.replace('/track'), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pendaftaran gagal');
      setLoading(false);
    }
  };

  if (preparing) return <PreparationScreen />;

  return (
    <OnboardingFrame step={5} compactStep="3/3">
      <div className="onboarding-grid">
        <section className="onboarding-copy">
          <span className="eyebrow">Langkah 5 dari 6</span>
          <h1>
            Selesaikan <em>pengaturanmu</em>
          </h1>
          <p>
            Sedikit lagi! Buat akun untuk menyimpan kemajuanmu dan mulai
            belajar.
          </p>
          <form className="setup-form" onSubmit={submit}>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <label>
              Nama
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Namamu"
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Kata sandi
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimal 8 karakter"
              />
            </label>
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? 'Membuat akunmu…' : 'Buat Akun'}{' '}
              <Icon name="arrow-right" width={22} />
            </button>
          </form>
          <span className="onboarding-login">
            Sudah punya akun? <Link href="/login">Masuk</Link>
          </span>
        </section>
        <BrandIllustration lines={5} />
      </div>
    </OnboardingFrame>
  );
}
