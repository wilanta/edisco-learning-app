'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageSkeleton, useCurrentUser } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { apiFetch } from '@/lib/api-client';

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
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  order: number;
};
const CATEGORY_LABELS: Record<string, string> = {
  PROGRAMMING: 'Pemrograman',
  LANGUAGE: 'Bahasa',
  MATH: 'Matematika',
  SCIENCE: 'Sains',
  ENGINEERING: 'Teknik',
  GENERAL: 'Umum',
};

export default function TrackPage() {
  const { user } = useCurrentUser();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch<{ tracks: Track[] }>('/tracks')
      .then(({ tracks: data }) => {
        setTracks(data);
        setSelectedId(data[0]?.id || '');
        setLoading(false);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error ? caught.message : 'Tidak dapat memuat jalur',
        );
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!selectedId) {
      setLessons([]);
      return;
    }
    apiFetch<{ lessons: Lesson[] }>(`/tracks/${selectedId}`).then((data) =>
      setLessons(data.lessons),
    );
  }, [selectedId]);
  const selected = tracks.find((track) => track.id === selectedId);
  const current =
    lessons.find((lesson) => lesson.status !== 'COMPLETED') || lessons[0];
  const percent = selected?.lessonCount
    ? Math.round((selected.completedCount / selected.lessonCount) * 100)
    : 0;
  const visibleNodes = useMemo(
    () => [
      ...lessons,
      ...(lessons.length && (user?.freeGenerationsLeft || 0) > 0
        ? [
            {
              userLessonId: 'next',
              title: 'Tantangan berikutnya',
              status: 'LOCKED' as const,
              order: lessons.length + 1,
            },
          ]
        : []),
    ],
    [lessons, user],
  );
  if (loading) return <PageSkeleton />;
  return (
    <div className="track-page page-wrap">
      {error && <div className="alert error">{error}</div>}
      {!tracks.length ? (
        <section className="surface empty-state">
          <Icon name="layers" />
          <h1>Buat jalur belajar pertamamu</h1>
          <p>
            Beri tahu Edisco apa yang ingin kamu pelajari dan kami akan
            mengubahnya menjadi jalur interaktif yang jelas.
          </p>
          <Link href="/new" className="primary-button">
            Buat pelajaran
          </Link>
        </section>
      ) : (
        <>
          <div className="track-heading surface">
            <div>
              <span>Jalur belajar</span>
              <select
                aria-label="Pilih jalur belajar"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title}
                  </option>
                ))}
              </select>
            </div>
            <Icon name="layers" />
          </div>
          <div className="track-layout">
            <section
              className="learning-path scenery"
              aria-label={`Jalur belajar ${selected?.title}`}
            >
              <div className="track-intro">
                <small>
                  {selected?.category
                    ? CATEGORY_LABELS[selected.category] ||
                      selected.category.replaceAll('_', ' ')
                    : ''}
                </small>
                <h1>{selected?.title}</h1>
                <p>Selesaikan pelajaran berikut untuk menguasai topik ini.</p>
              </div>
              <div className="path-nodes">
                {visibleNodes.map((lesson, index) => {
                  const locked = lesson.status === 'LOCKED';
                  const done = lesson.status === 'COMPLETED';
                  return (
                    <div
                      className={`path-node ${index % 2 ? 'left' : 'right'} ${done ? 'done' : ''}`}
                      key={lesson.userLessonId}
                    >
                      <span className="path-line" />
                      {locked ? (
                        <Link
                          href="/new"
                          className="node-button locked"
                          aria-label="Buat pelajaran berikutnya"
                        >
                          <Icon name="lock" />
                        </Link>
                      ) : (
                        <Link
                          href={`/lesson/${lesson.userLessonId}`}
                          className={`node-button ${index === 0 || lesson.status === 'IN_PROGRESS' ? 'current' : ''}`}
                          aria-label={`Buka ${lesson.title}`}
                        >
                          <Icon name={done ? 'check' : 'play'} />
                        </Link>
                      )}
                      <div className="node-copy">
                        <strong>
                          {lesson.order}. {lesson.title}
                        </strong>
                        <span>
                          {done
                            ? 'Selesai'
                            : locked
                              ? 'Buat pelajaran berikutnya'
                              : lesson.status === 'IN_PROGRESS'
                                ? 'Lanjutkan'
                                : 'Mulai perjalananmu'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <aside className="track-aside">
              <section className="surface progress-card">
                <h2>Kemajuanmu</h2>
                <div
                  className="progress-ring"
                  style={
                    {
                      '--progress': `${percent * 3.6}deg`,
                    } as React.CSSProperties
                  }
                >
                  <span>
                    {selected?.completedCount || 0}/{selected?.lessonCount || 0}
                  </span>
                </div>
                <strong>{percent}%</strong>
                <p>Pelajaran selesai</p>
              </section>
              {current && (
                <section className="surface current-card">
                  <h2>Pelajaran Saat Ini</h2>
                  <div>
                    <span>
                      <Icon name="play" />
                    </span>
                    <p>
                      <strong>
                        {current.order}. {current.title}
                      </strong>
                      <small>
                        {current.status === 'IN_PROGRESS'
                          ? 'Lanjutkan dari terakhir belajar'
                          : 'Siap saat kamu siap'}
                      </small>
                    </p>
                  </div>
                  <Link
                    href={`/lesson/${current.userLessonId}`}
                    className="primary-button"
                  >
                    Lanjutkan Pelajaran <Icon name="arrow-right" width={18} />
                  </Link>
                </section>
              )}
              <section className="surface tip-card">
                <Icon name="target" />
                <p>
                  <strong>Tips belajar</strong>
                  <span>
                    Langkah kecil yang diulang secara rutin menghasilkan
                    kemajuan yang bertahan lama.
                  </span>
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
