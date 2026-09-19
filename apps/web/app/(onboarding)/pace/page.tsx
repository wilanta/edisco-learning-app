'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getOnboardingDraft,
  updateOnboardingDraft,
} from '../../../lib/onboarding-draft';

type Pace = 'CASUAL' | 'REGULAR' | 'INTENSIVE';

const PACES: { id: Pace; label: string; desc: string }[] = [
  { id: 'CASUAL', label: 'Casual', desc: '5–10 min/day' },
  { id: 'REGULAR', label: 'Regular', desc: '15–20 min/day' },
  { id: 'INTENSIVE', label: 'Intensive', desc: '30+ min/day' },
];

export default function PacePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Pace | null>(null);

  useEffect(() => {
    const draft = getOnboardingDraft();
    // Redirect back if no interests (no skipping)
    if (!draft.interests || draft.interests.length === 0) {
      router.replace('/interests');
    }
    if (draft.pace) {
      setSelected(draft.pace);
    }
  }, [router]);

  const handleNext = () => {
    if (!selected) return;
    updateOnboardingDraft({ pace: selected });
    router.push('/register');
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-6 max-w-xl mx-auto w-full">
      <h1 className="text-3xl font-bold mt-12 mb-2 text-center">
        Set your daily goal
      </h1>
      <p className="text-gray-500 mb-8 text-center">
        How much time do you want to spend learning?
      </p>

      <div className="flex flex-col gap-4 w-full mb-8">
        {PACES.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`w-full p-5 rounded-xl border-2 flex items-center justify-between font-medium transition-colors ${
              selected === p.id
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <span className="text-lg">{p.label}</span>
            <span
              className={selected === p.id ? 'text-blue-600' : 'text-gray-500'}
            >
              {p.desc}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleNext}
        disabled={!selected}
        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        Continue
      </button>
    </div>
  );
}
