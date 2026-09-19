'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, removeAuthToken } from '../../../lib/api-client';
import Link from 'next/link';

type Track = {
  id: string;
  title: string;
  category: string;
  lessonCount: number;
  completedCount: number;
};

type Lesson = {
  userLessonId: string;
  title: string;
  status: string;
  order: number;
};

export default function TrackPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/users/me'),
      apiFetch<{ tracks: Track[] }>('/tracks')
    ])
      .then(([userData, tracksData]) => {
        setUser(userData);
        const fetchedTracks = tracksData?.tracks || [];
        setTracks(fetchedTracks);
        if (fetchedTracks.length > 0 && fetchedTracks[0]) {
          setSelectedTrackId(fetchedTracks[0].id);
        }
        setLoading(false);
      })
      .catch(() => {
        removeAuthToken();
        router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (selectedTrackId) {
      apiFetch<{ lessons: Lesson[] }>(`/tracks/${selectedTrackId}`).then((data) => {
        setLessons(data.lessons || []);
      }).catch(console.error);
    }
  }, [selectedTrackId]);

  if (loading) return <div className="p-8 max-w-4xl mx-auto">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Your Learning Tracks</h1>
        <div className="space-x-4">
          <Link href="/new" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
            + New Lesson
          </Link>
          <button type="button"
            onClick={() => {
              removeAuthToken();
              router.replace('/welcome');
            }}
            className="text-gray-500 hover:text-gray-800"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-8 border border-gray-100">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Welcome, {user?.name}!</h2>
        <div className="flex gap-6 text-sm text-gray-600">
          <p><span className="font-semibold">Pace:</span> {user?.pace}</p>
          <p><span className="font-semibold">Generations left:</span> {user?.freeGenerationsLeft}</p>
        </div>
      </div>
      
      {tracks.length === 0 ? (
        <div className="text-center p-16 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
          <h3 className="text-xl font-medium text-gray-700 mb-2">No tracks yet</h3>
          <p className="text-gray-500 mb-6">Start your learning journey by generating your first lesson.</p>
          <Link href="/new" className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 text-lg font-medium">
            Generate First Lesson
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-3">
            <h3 className="font-semibold text-gray-700 mb-4 uppercase text-sm tracking-wider">Tracks</h3>
            {tracks.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTrackId(t.id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${selectedTrackId === t.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
              >
                <div className="font-medium truncate">{t.title}</div>
                <div className="text-xs mt-1 opacity-75">{t.category}</div>
                <div className="mt-3 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full" 
                    style={{ width: `${t.lessonCount > 0 ? (t.completedCount / t.lessonCount) * 100 : 0}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
          
          <div className="md:col-span-2">
            <h3 className="font-semibold text-gray-700 mb-4 uppercase text-sm tracking-wider">Lessons</h3>
            <div className="space-y-3">
              {lessons.map((lesson) => (
                <Link
                  href={`/lesson/${lesson.userLessonId}`}
                  key={lesson.userLessonId}
                  className="block bg-white p-5 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-blue-600 mb-1">Lesson {lesson.order}</div>
                      <div className="text-lg font-medium text-gray-900">{lesson.title}</div>
                    </div>
                    <div className="flex-shrink-0">
                      {lesson.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Completed
                        </span>
                      ) : lesson.status === 'IN_PROGRESS' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Not Started
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {lessons.length === 0 && (
                <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                  No lessons found in this track.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
