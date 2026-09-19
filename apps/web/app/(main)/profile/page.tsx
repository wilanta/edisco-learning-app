'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, removeAuthToken } from '../../../lib/api-client';
import Link from 'next/link';

type Pace = 'CASUAL' | 'REGULAR' | 'INTENSIVE';

const PACES: { id: Pace; label: string; desc: string }[] = [
  { id: 'CASUAL', label: 'Casual', desc: 'Shorter content' },
  { id: 'REGULAR', label: 'Regular', desc: 'Standard content' },
  { id: 'INTENSIVE', label: 'Intensive', desc: 'Challenging content' },
];

const CATEGORIES = [
  'Programming',
  'Language',
  'Math',
  'Science',
  'Engineering',
  'Career/Soft Skills',
  'Other',
];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Form states
  const [selectedPace, setSelectedPace] = useState<Pace>('REGULAR');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    apiFetch('/users/me')
      .then((userData: any) => {
        setUser(userData);
        if (userData.pace) setSelectedPace(userData.pace);

        if (userData.interests && userData.interests.length > 0) {
          const standard = userData.interests.filter(
            (i: string) => CATEGORIES.includes(i) || i === 'Other',
          );
          const other = userData.interests.find(
            (i: string) => !CATEGORIES.includes(i) && i !== 'Other',
          );

          const sel = [...standard];
          if (other) {
            sel.push('Other');
            setOtherText(other);
          }
          setSelectedInterests(sel);
        }
        setLoading(false);
      })
      .catch(() => {
        removeAuthToken();
        router.replace('/login');
      });
  }, [router]);

  const toggleCategory = (cat: string) => {
    if (selectedInterests.includes(cat)) {
      setSelectedInterests(selectedInterests.filter((c) => c !== cat));
    } else {
      setSelectedInterests([...selectedInterests, cat]);
    }
  };

  const handleSave = async () => {
    if (selectedInterests.length === 0) {
      setMessage({
        text: 'Please select at least one interest.',
        type: 'error',
      });
      return;
    }

    let finalInterests = [...selectedInterests];
    if (selectedInterests.includes('Other') && otherText.trim()) {
      finalInterests = finalInterests.filter((i) => i !== 'Other');
      finalInterests.push(otherText.trim());
    }

    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const updatedProfile = await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          pace: selectedPace,
          interests: finalInterests,
        }),
      });
      setUser((prev: any) => ({
        ...prev,
        pace: updatedProfile.pace,
        interests: updatedProfile.interests,
      }));
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({
        text: err.message || 'Failed to update profile',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 max-w-4xl mx-auto">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Your Profile</h1>
        <div className="space-x-4">
          <Link
            href="/track"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            &larr; Back to Tracks
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold uppercase">
            {user?.name?.charAt(0) || '?'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
            <p className="text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">
              Generations Left
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {user?.freeGenerationsLeft ?? 0}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">
              Total XP
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {user?.totalXp ?? 0}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">
              Current Streak
            </div>
            <div className="text-2xl font-bold text-orange-500">
              {user?.currentStreak ?? 0} 🔥
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">
              Longest Streak
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {user?.longestStreak ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Learning Preferences
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Update your pace and interests for future generated lessons.
          </p>
        </div>

        <div className="p-6">
          {message.text && (
            <div
              className={`p-4 rounded-md mb-6 text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
            >
              {message.text}
            </div>
          )}

          <div className="mb-8">
            <h3 className="font-semibold text-gray-700 mb-4 uppercase text-sm tracking-wider">
              Learning Pace
            </h3>
            <div className="flex flex-col gap-3">
              {PACES.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelectedPace(p.id)}
                  className={`w-full p-4 rounded-xl border-2 flex items-center justify-between font-medium transition-colors ${
                    selectedPace === p.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <span>{p.label}</span>
                  <span
                    className={
                      selectedPace === p.id
                        ? 'text-blue-600'
                        : 'text-gray-500 text-sm'
                    }
                  >
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="font-semibold text-gray-700 mb-4 uppercase text-sm tracking-wider">
              Interests
            </h3>
            <div className="flex flex-col gap-3">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="w-full">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`w-full p-4 rounded-xl border-2 text-left font-medium transition-colors ${
                      selectedInterests.includes(cat)
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {cat}
                  </button>
                  {cat === 'Other' && selectedInterests.includes('Other') && (
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
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || selectedInterests.length === 0}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
