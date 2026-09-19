'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

const CATEGORIES = [
  'PROGRAMMING',
  'LANGUAGE',
  'MATH',
  'SCIENCE',
  'ENGINEERING',
  'GENERAL',
];

export default function NewLessonPage() {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage('Submitting request...');

    try {
      const response = await apiFetch<{ jobId: string; status: string }>(
        '/lessons/generate',
        {
          method: 'POST',
          body: JSON.stringify({ topic, category }),
        },
      );
      setJobId(response.jobId);
    } catch (err: any) {
      setError(err.message || 'Failed to start generation');
      setLoading(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollJob = async () => {
      if (!jobId) return;
      try {
        const data = await apiFetch<{
          status: string;
          resultUserLessonId?: string;
          errorMessage?: string;
        }>(`/lessons/generate/${jobId}`);
        if (data.status === 'DONE') {
          setStatusMessage('Generation complete! Redirecting...');
          if (data.resultUserLessonId) {
            router.push(`/lesson/${data.resultUserLessonId}`);
          } else {
            router.push('/track'); // Fallback if for some reason missing
          }
        } else if (data.status === 'FAILED') {
          setError(data.errorMessage || 'Generation failed');
          setLoading(false);
          setJobId(null);
        } else {
          setStatusMessage(
            'Generating lesson... (this might take a few seconds)',
          );
        }
      } catch (err: any) {
        setError('Error polling generation status: ' + err.message);
        setLoading(false);
        setJobId(null);
      }
    };

    if (jobId) {
      interval = setInterval(pollJob, 2500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, router]);

  return (
    <div className="max-w-2xl mx-auto p-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Create New Lesson</h1>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleGenerate} className="space-y-6">
        <div>
          <label
            htmlFor="topic"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Topic
          </label>
          <input
            id="topic"
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={loading}
            placeholder="e.g., Introduction to React Hooks"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? statusMessage || 'Generating...' : 'Generate Lesson'}
        </button>
      </form>
    </div>
  );
}
