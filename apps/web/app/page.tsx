'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken } from '../lib/api-client';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.replace('/track');
    } else {
      router.replace('/welcome');
    }
  }, [router]);

  return <div className="p-8">Loading...</div>;
}
