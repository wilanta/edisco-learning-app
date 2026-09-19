'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import Link from 'next/link';

type Part = {
  partId: string;
  order: number;
  type: string;
  prompt: any;
  userProgress: {
    isCorrect: boolean | null;
    attempts: number;
  };
};

type Lesson = {
  userLessonId: string;
  title: string;
  status: string;
  parts: Part[];
};

export default function LessonPage({ params }: { params: Promise<{ userLessonId: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);

  const [answer, setAnswer] = useState<any>('');
  const [matchingPairs, setMatchingPairs] = useState<{left: string, right: string}[]>([]);
  const [fillBlanks, setFillBlanks] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean, explanation?: string } | null>(null);

  useEffect(() => {
    apiFetch<Lesson>(`/lessons/${unwrappedParams.userLessonId}`)
      .then((data) => {
        setLesson(data);
        // Find first incomplete part
        const firstIncomplete = data.parts.findIndex(p => p.userProgress.isCorrect !== true);
        if (firstIncomplete !== -1) {
          setCurrentPartIndex(firstIncomplete);
        } else {
          setCurrentPartIndex(0); // If all complete, start from 0 for review
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load lesson');
        setLoading(false);
      });
  }, [unwrappedParams.userLessonId]);

  // Reset state when part changes
  useEffect(() => {
    setAnswer('');
    setMatchingPairs([]);
    setFillBlanks({});
    setFeedback(null);
  }, [currentPartIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    
    setSubmitting(true);
    setFeedback(null);
    
    const part = lesson.parts[currentPartIndex];
    if (!part) {
      setSubmitting(false);
      return;
    }
    let submitPayload = answer;
    
    if (part.type === 'MATCHING') submitPayload = matchingPairs;
    else if (part.type === 'FILL_IN_BLANK') submitPayload = fillBlanks;
    else if (part.type === 'TRUE_FALSE') submitPayload = answer === 'true';

    try {
      const res = await apiFetch<{ isCorrect: boolean, explanation: string, xpEarned: number, lessonCompleted: boolean }>(
        `/lessons/${lesson.userLessonId}/parts/${part.partId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ answer: submitPayload })
        }
      );
      
      setFeedback({
        isCorrect: res.isCorrect,
        explanation: res.explanation
      });

      // Update local state
      const newParts = [...lesson.parts];
      if (newParts[currentPartIndex]) {
        newParts[currentPartIndex].userProgress.isCorrect = res.isCorrect;
        newParts[currentPartIndex].userProgress.attempts += 1;
      }
      setLesson({ ...lesson, parts: newParts });

    } catch (err: any) {
      setError(err.message || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 max-w-3xl mx-auto text-center">Loading lesson...</div>;
  if (error) return <div className="p-8 max-w-3xl mx-auto text-red-600">{error}</div>;
  if (!lesson) return null;

  const part = lesson.parts[currentPartIndex];
  if (!part) return <div className="p-8 max-w-3xl mx-auto text-center">Lesson part not found.</div>;
  const isComplete = lesson.parts.every(p => p.userProgress.isCorrect);

  const renderInput = () => {
    const p = part.prompt || {};
    switch (part.type) {
      case 'MULTIPLE_CHOICE':
        return (
          <div className="space-y-2 mt-4">
            {p.options?.map((opt: string) => (
              <label key={opt} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="mc_answer"
                  value={opt}
                  checked={answer === opt}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={submitting || (feedback?.isCorrect)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      
      case 'TRUE_FALSE':
        return (
          <div className="space-y-2 mt-4 flex gap-4">
            <label className="flex-1 flex items-center justify-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="radio" name="tf_answer" value="true" checked={answer === 'true'} onChange={(e) => setAnswer(e.target.value)} disabled={submitting || (feedback?.isCorrect)} className="h-4 w-4" />
              <span className="font-medium text-lg">True</span>
            </label>
            <label className="flex-1 flex items-center justify-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="radio" name="tf_answer" value="false" checked={answer === 'false'} onChange={(e) => setAnswer(e.target.value)} disabled={submitting || (feedback?.isCorrect)} className="h-4 w-4" />
              <span className="font-medium text-lg">False</span>
            </label>
          </div>
        );

      case 'FILL_IN_BLANK':
        return (
          <div className="mt-4 space-y-4">
            {p.blanks?.map((b: any, idx: number) => (
              <div key={b.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Blank {idx + 1}</label>
                <input
                  type="text"
                  value={fillBlanks[b.id] || ''}
                  onChange={(e) => setFillBlanks({...fillBlanks, [b.id]: e.target.value})}
                  disabled={submitting || (feedback?.isCorrect)}
                  className="w-full px-4 py-2 border rounded-md focus:ring-blue-500"
                  required
                />
              </div>
            ))}
          </div>
        );

      case 'MATCHING':
        // Simplified matching: render dropdowns for left options to select right options
        return (
          <div className="mt-4 space-y-4">
            {p.leftOptions?.map((left: string, idx: number) => {
              const currentMatch = matchingPairs.find(mp => mp.left === left)?.right || '';
              return (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 p-3 bg-gray-50 border rounded-md">{left}</div>
                  <div className="flex-shrink-0 text-gray-400 font-bold hidden sm:block">→</div>
                  <select
                    value={currentMatch}
                    onChange={(e) => {
                      const newPairs = matchingPairs.filter(mp => mp.left !== left);
                      if (e.target.value) newPairs.push({ left, right: e.target.value });
                      setMatchingPairs(newPairs);
                    }}
                    disabled={submitting || (feedback?.isCorrect)}
                    className="flex-1 px-4 py-3 border rounded-md focus:ring-blue-500"
                    required
                  >
                    <option value="">Select match...</option>
                    {p.rightOptions?.map((right: string, i: number) => (
                      <option key={i} value={right}>{right}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        );

      case 'CODE_PREDICT':
      case 'TRANSLATE':
      case 'SHORT_ANSWER':
      default:
        return (
          <div className="mt-4">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitting || (feedback?.isCorrect)}
              className="w-full px-4 py-3 border rounded-md focus:ring-blue-500 font-mono text-sm h-32"
              placeholder="Type your answer here..."
              required
            />
          </div>
        );
    }
  };

  const isNextAvailable = feedback?.isCorrect || part.userProgress.isCorrect;

  return (
    <div className="max-w-3xl mx-auto p-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/track" className="text-gray-500 hover:text-gray-900 text-sm flex items-center">
          ← Back to Track
        </Link>
        <div className="text-sm text-gray-500 font-medium">
          Part {currentPartIndex + 1} of {lesson.parts.length}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">{lesson.title}</h1>
          {isComplete && <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full">COMPLETED</span>}
        </div>
        
        <div className="p-6">
          <div className="mb-2 text-sm font-semibold text-blue-600 uppercase tracking-wider">
            {part.type.replace(/_/g, ' ')}
          </div>
          <h2 className="text-lg text-gray-800 font-medium mb-6">{part.prompt?.question || 'Answer the question'}</h2>

          <form onSubmit={handleSubmit}>
            {renderInput()}
            
            <div className="mt-8">
              {!isNextAvailable ? (
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Checking...' : 'Check Answer'}
                </button>
              ) : null}
            </div>
          </form>

          {feedback && (
            <div className={`mt-6 p-4 border rounded-lg ${feedback.isCorrect ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              <div className="font-bold mb-1">
                {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
              </div>
              {feedback.explanation && (
                <div className="text-sm opacity-90">{feedback.explanation}</div>
              )}
            </div>
          )}
          
          {part.userProgress.isCorrect && !feedback && (
             <div className="mt-6 p-4 border rounded-lg bg-green-50 border-green-200 text-green-900">
               <div className="font-bold mb-1">Correct!</div>
               <div className="text-sm opacity-90">You previously completed this part.</div>
             </div>
          )}

          {isNextAvailable && (
            <div className="mt-6 border-t pt-6 flex justify-end">
              {currentPartIndex < lesson.parts.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentPartIndex(currentPartIndex + 1)}
                  className="px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-black"
                >
                  Next Part →
                </button>
              ) : (
                <Link
                  href="/track"
                  className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
                >
                  Finish Lesson
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Progress dots */}
      <div className="flex justify-center space-x-2 mt-8">
        {lesson.parts.map((p, idx) => (
          <button
            key={p.partId}
            type="button"
            onClick={() => setCurrentPartIndex(idx)}
            className={`w-3 h-3 rounded-full transition-colors ${
              idx === currentPartIndex 
                ? 'bg-blue-600 ring-2 ring-offset-2 ring-blue-600' 
                : p.userProgress.isCorrect 
                  ? 'bg-green-500' 
                  : 'bg-gray-300 hover:bg-gray-400'
            }`}
            title={`Part ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
