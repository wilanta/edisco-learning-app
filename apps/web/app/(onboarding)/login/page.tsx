'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { BrandIllustration, OnboardingFrame } from '@/components/onboarding-ui';
import { apiFetch, setAuthToken } from '@/lib/api-client';
import {
  clearOnboardingDraft,
  getOnboardingDraft,
} from '@/lib/onboarding-draft';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(result.token);
      const user = await apiFetch<{ onboardingCompletedAt: string | null }>(
        '/users/me',
      );
      if (!user.onboardingCompletedAt) {
        const draft = getOnboardingDraft();
        if (!draft.interests?.length || !draft.pace) {
          router.replace('/interests');
          return;
        }
        await apiFetch('/users/me/onboarding', {
          method: 'PATCH',
          body: JSON.stringify(draft),
        });
      }
      clearOnboardingDraft();
      router.replace('/track');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal masuk');
      setLoading(false);
    }
  };

  return (
    <OnboardingFrame>
      <div className="onboarding-grid">
        <section className="onboarding-copy">
          <span className="eyebrow">Selamat datang kembali</span>
          <h1>
            Lanjutkan <em>perjalananmu</em>
          </h1>
          <p>
            Masuk untuk melanjutkan tepat dari tempat terakhir kamu belajar.
          </p>
          <form className="setup-form" onSubmit={submit}>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Kata sandi
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? 'Sedang masuk…' : 'Masuk'}{' '}
              <Icon name="arrow-right" width={22} />
            </button>
          </form>
          <span className="onboarding-login">
            Baru di Edisco? <Link href="/welcome">Buat akun</Link>
          </span>
        </section>
        <BrandIllustration />
      </div>
    </OnboardingFrame>
  );
}
