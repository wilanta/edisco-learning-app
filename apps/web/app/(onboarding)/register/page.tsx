'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, setAuthToken } from '../../../lib/api-client';
import {
  getOnboardingDraft,
  clearOnboardingDraft,
} from '../../../lib/onboarding-draft';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Optionally check if they skipped onboarding accidentally.
    // The spec says onboarding can't be skipped.
    const draft = getOnboardingDraft();
    if (!draft.interests || !draft.pace) {
      router.replace('/welcome');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Register the user
      const registerRes = await apiFetch<{ userId: string; token: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        },
      );

      setAuthToken(registerRes.token);

      // 2. Read preferences and PATCH onboarding
      const draft = getOnboardingDraft();
      if (draft.interests && draft.pace) {
        await apiFetch('/users/me/onboarding', {
          method: 'PATCH',
          body: JSON.stringify({
            interests: draft.interests,
            pace: draft.pace,
          }),
        });
      }

      // 3. Clean up and redirect
      clearOnboardingDraft();
      router.push('/track');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-6 max-w-sm mx-auto w-full pt-16">
      <h1 className="text-3xl font-bold mb-8 text-center">
        Create your account
      </h1>

      {error && (
        <div className="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-600 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-600 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-600 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 mt-4 bg-blue-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 hover:bg-blue-700"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 font-semibold underline">
          Log in
        </Link>
      </div>
    </div>
  );
}
