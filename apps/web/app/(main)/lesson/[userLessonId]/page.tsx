'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Prompt = {
  question?: string;
  explanation?: string;
  options?: string[];
  blanks?: { id: string }[];
  leftOptions?: string[];
  rightOptions?: string[];
};

type Part = {
  partId: string;
  order: number;
  type: string;
  prompt: Prompt;
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

const PART_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: 'Pilihan Ganda',
  FILL_IN_BLANK: 'Isi Bagian Kosong',
  MATCHING: 'Mencocokkan',
  TRUE_FALSE: 'Benar atau Salah',
  CODE_PREDICT: 'Prediksi Kode',
  TRANSLATE: 'Terjemahkan',
  SHORT_ANSWER: 'Jawaban Singkat',
};

export default function LessonPage({
  params,
}: {
  params: Promise<{ userLessonId: string }>;
}) {
  const unwrappedParams = use(params);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);

  const [answer, setAnswer] = useState('');
  const [matchingPairs, setMatchingPairs] = useState<
    { left: string; right: string }[]
  >([]);
  const [fillBlanks, setFillBlanks] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    explanation?: string;
  } | null>(null);

  useEffect(() => {
    apiFetch<Lesson>(`/lessons/${unwrappedParams.userLessonId}`)
      .then((data) => {
        setLesson(data);
        // Find first incomplete part
        const firstIncomplete = data.parts.findIndex(
          (p) => p.userProgress.isCorrect !== true,
        );
        if (firstIncomplete !== -1) {
          setCurrentPartIndex(firstIncomplete);
        } else {
          setCurrentPartIndex(0); // If all complete, start from 0 for review
        }
        setLoading(false);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'Gagal memuat pelajaran',
        );
        setLoading(false);
      });
  }, [unwrappedParams.userLessonId]);

  const goToPart = (index: number) => {
    setAnswer('');
    setMatchingPairs([]);
    setFillBlanks({});
    setFeedback(null);
    setCurrentPartIndex(index);
  };

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
    let submitPayload: unknown = answer;

    if (part.type === 'MATCHING') submitPayload = matchingPairs;
    else if (part.type === 'FILL_IN_BLANK') submitPayload = fillBlanks;
    else if (part.type === 'TRUE_FALSE') submitPayload = answer === 'true';

    try {
      const res = await apiFetch<{
        isCorrect: boolean;
        explanation: string;
        xpEarned: number;
        lessonCompleted: boolean;
      }>(`/lessons/${lesson.userLessonId}/parts/${part.partId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer: submitPayload }),
      });

      setFeedback({
        isCorrect: res.isCorrect,
        explanation: res.explanation,
      });

      // Update local state
      const newParts = [...lesson.parts];
      if (newParts[currentPartIndex]) {
        newParts[currentPartIndex].userProgress.isCorrect = res.isCorrect;
        newParts[currentPartIndex].userProgress.attempts += 1;
      }
      setLesson({ ...lesson, parts: newParts });
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'Gagal mengirim jawaban',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        Memuat pelajaran...
      </div>
    );
  if (error)
    return <div className="p-8 max-w-3xl mx-auto text-red-600">{error}</div>;
  if (!lesson) return null;

  const part = lesson.parts[currentPartIndex];
  if (!part)
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        Bagian pelajaran tidak ditemukan.
      </div>
    );
  const isComplete = lesson.parts.every((p) => p.userProgress.isCorrect);

  const renderInput = () => {
    const p = part.prompt;
    switch (part.type) {
      case 'MULTIPLE_CHOICE':
        return (
          <div className="space-y-2 mt-4">
            {p.options?.map((opt: string) => (
              <label
                key={opt}
                className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="radio"
                  name="mc_answer"
                  value={opt}
                  checked={answer === opt}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={submitting || feedback?.isCorrect}
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
              <input
                type="radio"
                name="tf_answer"
                value="true"
                checked={answer === 'true'}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={submitting || feedback?.isCorrect}
                className="h-4 w-4"
              />
              <span className="font-medium text-lg">Benar</span>
            </label>
            <label className="flex-1 flex items-center justify-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name="tf_answer"
                value="false"
                checked={answer === 'false'}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={submitting || feedback?.isCorrect}
                className="h-4 w-4"
              />
              <span className="font-medium text-lg">Salah</span>
            </label>
          </div>
        );

      case 'FILL_IN_BLANK':
        return (
          <div className="mt-4 space-y-4">
            {p.blanks?.map((blank, idx) => (
              <div key={blank.id}>
                <label
                  htmlFor={`blank-${blank.id}`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Bagian kosong {idx + 1}
                </label>
                <input
                  type="text"
                  id={`blank-${blank.id}`}
                  value={fillBlanks[blank.id] || ''}
                  onChange={(e) =>
                    setFillBlanks({
                      ...fillBlanks,
                      [blank.id]: e.target.value,
                    })
                  }
                  disabled={submitting || feedback?.isCorrect}
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
            {p.leftOptions?.map((left) => {
              const currentMatch =
                matchingPairs.find((mp) => mp.left === left)?.right || '';
              return (
                <div
                  key={left}
                  className="flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <div className="flex-1 p-3 bg-gray-50 border rounded-md">
                    {left}
                  </div>
                  <div className="flex-shrink-0 text-gray-400 font-bold hidden sm:block">
                    →
                  </div>
                  <select
                    value={currentMatch}
                    onChange={(e) => {
                      const newPairs = matchingPairs.filter(
                        (mp) => mp.left !== left,
                      );
                      if (e.target.value)
                        newPairs.push({ left, right: e.target.value });
                      setMatchingPairs(newPairs);
                    }}
                    disabled={submitting || feedback?.isCorrect}
                    className="flex-1 px-4 py-3 border rounded-md focus:ring-blue-500"
                    required
                  >
                    <option value="">Pilih pasangan...</option>
                    {p.rightOptions?.map((right) => (
                      <option key={right} value={right}>
                        {right}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        );

      default:
        return (
          <div className="mt-4">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitting || feedback?.isCorrect}
              className="w-full px-4 py-3 border rounded-md focus:ring-blue-500 font-mono text-sm h-32"
              placeholder="Ketik jawabanmu di sini..."
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
        <Link
          href="/track"
          className="text-gray-500 hover:text-gray-900 text-sm flex items-center"
        >
          ← Kembali ke Jalur
        </Link>
        <div className="text-sm text-gray-500 font-medium">
          Bagian {currentPartIndex + 1} dari {lesson.parts.length}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">{lesson.title}</h1>
          {isComplete && (
            <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full">
              SELESAI
            </span>
          )}
        </div>

        <div className="p-6">
          <div className="mb-2 text-sm font-semibold text-blue-600 uppercase tracking-wider">
            {PART_TYPE_LABELS[part.type] || part.type.replace(/_/g, ' ')}
          </div>
          <h2 className="text-lg text-gray-800 font-medium mb-6">
            {part.prompt?.question || 'Jawab pertanyaan berikut'}
          </h2>

          <form onSubmit={handleSubmit}>
            {renderInput()}

            <div className="mt-8">
              {!isNextAvailable ? (
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Memeriksa...' : 'Periksa Jawaban'}
                </button>
              ) : null}
            </div>
          </form>

          {feedback && (
            <div
              className={`mt-6 p-4 border rounded-lg ${feedback.isCorrect ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}
            >
              <div className="font-bold mb-1">
                {feedback.isCorrect ? 'Benar!' : 'Belum tepat'}
              </div>
              {feedback.explanation && (
                <div className="text-sm opacity-90">{feedback.explanation}</div>
              )}
            </div>
          )}

          {part.userProgress.isCorrect && !feedback && (
            <div className="mt-6 p-4 border rounded-lg bg-green-50 border-green-200 text-green-900">
              <div className="font-bold mb-1">Benar!</div>
              <div className="text-sm opacity-90">
                Kamu sudah menyelesaikan bagian ini sebelumnya.
              </div>
            </div>
          )}

          {isNextAvailable && (
            <div className="mt-6 border-t pt-6 flex justify-end">
              {currentPartIndex < lesson.parts.length - 1 ? (
                <button
                  type="button"
                  onClick={() => goToPart(currentPartIndex + 1)}
                  className="px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-black"
                >
                  Bagian Berikutnya →
                </button>
              ) : (
                <Link
                  href="/track"
                  className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
                >
                  Selesaikan Pelajaran
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
            onClick={() => goToPart(idx)}
            className={`w-3 h-3 rounded-full transition-colors ${
              idx === currentPartIndex
                ? 'bg-blue-600 ring-2 ring-offset-2 ring-blue-600'
                : p.userProgress.isCorrect
                  ? 'bg-green-500'
                  : 'bg-gray-300 hover:bg-gray-400'
            }`}
            title={`Bagian ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
