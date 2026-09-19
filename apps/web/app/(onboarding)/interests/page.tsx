'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getOnboardingDraft,
  updateOnboardingDraft,
} from '../../../lib/onboarding-draft';

const CATEGORIES = [
  'Programming',
  'Language',
  'Math',
  'Science',
  'Engineering',
  'Career/Soft Skills',
  'Other',
];

export default function InterestsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    const draft = getOnboardingDraft();
    if (draft.interests) {
      const standard = draft.interests.filter(
        (i) => CATEGORIES.includes(i) || i === 'Other',
      );
      const other = draft.interests.find(
        (i) => !CATEGORIES.includes(i) && i !== 'Other',
      );

      const sel = [...standard];
      if (other) {
        sel.push('Other');
        setOtherText(other);
      }
      setSelected(sel);
    }
  }, []);

  const toggleCategory = (cat: string) => {
    if (selected.includes(cat)) {
      setSelected(selected.filter((c) => c !== cat));
    } else {
      setSelected([...selected, cat]);
    }
  };

  const handleNext = () => {
    if (selected.length === 0) return;

    let finalInterests = [...selected];
    if (selected.includes('Other') && otherText.trim()) {
      // Replace "Other" with the actual text, or add it alongside.
      // The API expects a list of strings.
      finalInterests = finalInterests.filter((i) => i !== 'Other');
      finalInterests.push(otherText.trim());
    } else if (selected.includes('Other') && !otherText.trim()) {
      // If other is selected but text is empty, just remove it or keep it as 'Other'
      // We'll keep it as 'Other'
    }

    updateOnboardingDraft({ interests: finalInterests });
    router.push('/pace');
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-6 max-w-xl mx-auto w-full">
      <h1 className="text-3xl font-bold mt-12 mb-2 text-center">
        What do you want to learn?
      </h1>
      <p className="text-gray-500 mb-8 text-center">
        Select at least one interest.
      </p>

      <div className="flex flex-col gap-3 w-full mb-8">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="w-full">
            <button
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`w-full p-4 rounded-xl border-2 text-left font-medium transition-colors ${
                selected.includes(cat)
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              {cat}
            </button>
            {cat === 'Other' && selected.includes('Other') && (
              <input
                type="text"
                placeholder="Type your interest here..."
                className="mt-2 w-full p-3 rounded-xl border-2 border-gray-200 focus:border-blue-600 outline-none"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleNext}
        disabled={selected.length === 0}
        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        Continue
      </button>
    </div>
  );
}
