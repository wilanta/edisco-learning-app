'use client';
import Link from 'next/link';

export default function WelcomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to Edisco</h1>
      <p className="text-xl mb-8 text-gray-600">
        Learn anything, the way Duolingo teaches languages.
      </p>

      <Link
        href="/interests"
        className="px-8 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors"
      >
        Get Started
      </Link>

      <div className="mt-8 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 underline">
          Log in
        </Link>
      </div>
    </div>
  );
}
