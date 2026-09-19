'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, setAuthToken } from '../../../lib/api-client';
import { getOnboardingDraft, clearOnboardingDraft } from '../../../lib/onboarding-draft';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Login the user
      const loginRes = await apiFetch<{ userId: string; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setAuthToken(loginRes.token);

      // 2. Fetch user to see if onboarding is completed
      const user = await apiFetch<{ onboardingCompletedAt: string | null }>('/users/me', {
        method: 'GET'
      });

      if (!user.onboardingCompletedAt) {
        // If not completed, try to complete it with draft data
        const draft = getOnboardingDraft();
        if (draft.interests && draft.pace) {
          await apiFetch('/users/me/onboarding', {
            method: 'PATCH',
            body: JSON.stringify({
              interests: draft.interests,
              pace: draft.pace
            })
          });
          clearOnboardingDraft();
          router.push('/track');
        } else {
          // If no draft, they must complete onboarding
          router.push('/interests');
        }
      } else {
        // Already completed
        clearOnboardingDraft(); // clean up just in case
        router.push('/track');
      }

    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-6 max-w-sm mx-auto w-full pt-16">
      <h1 className="text-3xl font-bold mb-8 text-center">Log in</h1>
      
      {error && (
        <div className="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
          <input
            id="email"
            type="email"
            required
            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-600 outline-none"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
          <input
            id="password"
            type="password"
            required
            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-600 outline-none"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full py-4 mt-4 bg-blue-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 hover:bg-blue-700"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        Don't have an account? <Link href="/welcome" className="text-blue-600 font-semibold underline">Sign up</Link>
      </div>
    </div>
  );
}
