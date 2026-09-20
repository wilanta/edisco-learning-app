'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageSkeleton } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { apiFetch } from '@/lib/api-client';

type Lesson = {
  userLessonId: string;
  title: string;
  status: string;
  order: number;
};
type Group = { trackId: string; trackTitle: string; lessons: Lesson[] };
type Track = {
  id: string;
  category: string;
  lessonCount: number;
  completedCount: number;
};
const CATEGORY_LABELS: Record<string, string> = {
  PROGRAMMING: 'Pemrograman',
  LANGUAGE: 'Bahasa',
  MATH: 'Matematika',
  SCIENCE: 'Sains',
  ENGINEERING: 'Teknik',
  GENERAL: 'Umum',
};

export default function LessonsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      apiFetch<{ tracks: Group[] }>('/lessons'),
      apiFetch<{ tracks: Track[] }>('/tracks'),
    ]).then(([lessonData, trackData]) => {
      setGroups(lessonData.tracks);
      setTracks(trackData.tracks);
      setLoading(false);
    });
  }, []);
  const categories = useMemo(
    () => ['All', ...new Set(tracks.map((track) => track.category))],
    [tracks],
  );
  const shown = groups.filter((group) => {
    const track = tracks.find((item) => item.id === group.trackId);
    return (
      (category === 'All' || track?.category === category) &&
      `${group.trackTitle} ${group.lessons.map((lesson) => lesson.title).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  if (loading) return <PageSkeleton />;
  return (
    <div className="lessons-page page-wrap">
      <header className="lessons-header">
        <div>
          <h1 className="page-title">Pelajaranmu</h1>
          <p className="page-subtitle">
            Jelajahi dan lanjutkan perjalanan belajarmu.
          </p>
        </div>
        <button
          type="button"
          className="search-toggle"
          onClick={() => setSearchOpen((open) => !open)}
          aria-label="Cari pelajaran"
        >
          <Icon name="search" />
        </button>
        <label className={`lesson-search ${searchOpen ? 'open' : ''}`}>
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari pelajaran, topik, atau kata kunci…"
          />
        </label>
      </header>
      <div className="filter-row">
        {categories.slice(0, 4).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setCategory(item)}
            className={category === item ? 'active' : ''}
          >
            {item === 'All'
              ? 'Semua'
              : CATEGORY_LABELS[item] || item.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      <div className="lesson-layout">
        <section className="lesson-list">
          {shown.map((group, index) => {
            const track = tracks.find((item) => item.id === group.trackId);
            const next =
              group.lessons.find((lesson) => lesson.status !== 'COMPLETED') ||
              group.lessons[0];
            const progress = track?.lessonCount
              ? Math.round((track.completedCount / track.lessonCount) * 100)
              : 0;
            return (
              <article
                className={`lesson-card surface scenery ${index === 0 ? 'featured' : ''}`}
                key={group.trackId}
              >
                <small>
                  {track?.category
                    ? CATEGORY_LABELS[track.category] ||
                      track.category.replaceAll('_', ' ')
                    : ''}
                </small>
                <h2>{group.trackTitle}</h2>
                <div className="lesson-progress">
                  <i>
                    <b style={{ width: `${progress}%` }} />
                  </i>
                  <span>{progress}%</span>
                </div>
                {next && (
                  <Link href={`/lesson/${next.userLessonId}`}>
                    <span className="lesson-play">
                      <Icon name="play" />
                    </span>
                    <span>
                      <small>Pelajaran Berikutnya</small>
                      <strong>{next.title}</strong>
                    </span>
                  </Link>
                )}
              </article>
            );
          })}
          {!shown.length && (
            <section className="surface empty-state">
              <Icon name="search" />
              <h2>Tidak ada pelajaran yang cocok</h2>
              <p>Coba kategori atau kata pencarian lain.</p>
            </section>
          )}
        </section>
        <aside className="surface learning-summary">
          <h2>Aktivitas Belajarmu</h2>
          <p>
            <Icon name="book" />
            <span>
              <strong>{tracks.length}</strong> Jalur aktif
            </span>
          </p>
          <p>
            <Icon name="layers" />
            <span>
              <strong>
                {tracks.reduce((sum, track) => sum + track.lessonCount, 0)}
              </strong>{' '}
              Total pelajaran
            </span>
          </p>
          <p>
            <Icon name="check" />
            <span>
              <strong>
                {tracks.reduce((sum, track) => sum + track.completedCount, 0)}
              </strong>{' '}
              Selesai
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}
