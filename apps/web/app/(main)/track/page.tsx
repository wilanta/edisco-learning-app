'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, removeAuthToken } from '../../../lib/api-client';

export default function TrackPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/users/me')
      .then(data => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => {
        removeAuthToken();
        router.replace('/login');
      });
  }, [router]);

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Track</h1>
        <button type="button"
          onClick={() => {
            removeAuthToken();
            router.replace('/welcome');
          }}
          className="text-gray-500 underline"
        >
          Logout
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Welcome, {user?.name}!</h2>
        <div className="space-y-2 text-gray-700">
          <p><strong>Pace:</strong> {user?.pace}</p>
          <p><strong>Interests:</strong> {user?.interests?.join(', ')}</p>
          <p><strong>Free generations left:</strong> {user?.freeGenerationsLeft}</p>
        </div>
      </div>
      
      <div className="text-center p-12 border-2 border-dashed rounded-xl text-gray-500">
        You haven't generated any tracks yet. (Phase 4A)
      </div>
    </div>
  );
}
