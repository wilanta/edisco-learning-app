'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useCurrentUser } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { UserAvatar } from '@/components/user-avatar';

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const activity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stamp of user?.activityDates || []) {
      const key = stamp.slice(0, 10);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const today = new Date();
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (83 - index));
      return {
        key: date.toISOString().slice(0, 10),
        count: counts.get(date.toISOString().slice(0, 10)) || 0,
      };
    });
  }, [user]);
  const joined = user?.createdAt
    ? new Date(user.createdAt).getFullYear()
    : new Date().getFullYear();
  return (
    <div className="profile-page page-wrap">
      <header className="profile-title">
        <h1 className="page-title">Profilmu</h1>
        <button
          type="button"
          onClick={() => router.push('/settings')}
          aria-label="Pengaturan"
        >
          <Icon name="settings" />
        </button>
      </header>
      <section className="profile-hero surface scenery">
        <UserAvatar
          className="profile-avatar"
          name={user?.name}
          avatarUrl={user?.avatarUrl}
        />
        <div>
          <h2>{user?.name || 'Pelajar'}</h2>
          <p>
            {user?.email} · Bergabung pada {joined}
          </p>
          <strong>TOP #{user?.totalXp || 0}</strong>
        </div>
        <blockquote>
          "Langkah kecil setiap hari membawa kemajuan besar."
        </blockquote>
      </section>
      <section className="activity-section">
        <header>
          <h2>Waktu belajar</h2>
          <span>
            <Icon name="clock" /> Tahun Ini
          </span>
        </header>
        {/* <div
          className="activity-grid surface"
          role="img"
          aria-label="Learning activity over the last twelve weeks"
        >
          {activity.map((day) => (
            <i
              key={day.key}
              title={`${day.key}: ${day.count} completed parts`}
              className={`level-${Math.min(day.count, 4)}`}
            />
          ))}
        </div> */}
      </section>
      <section className="profile-stats">
        <article className="surface">
          <span>
            <Icon name="book" />
          </span>
          <strong>{user?.lessonCount || 0}</strong>
          <p>
            Pelajaran<small>Total pelajaran</small>
          </p>
        </article>
        <article className="surface">
          <span>
            <Icon name="check" />
          </span>
          <strong>{user?.completedLessonCount || 0}</strong>
          <p>
            Selesai<small>Pelajaran selesai</small>
          </p>
        </article>
        <article className="surface">
          <span>
            <Icon name="flame" />
          </span>
          <strong>{user?.currentStreak || 0}</strong>
          <p>
            Rangkaian saat ini<small>Terus pertahankan</small>
          </p>
        </article>
        <article className="surface">
          <span>
            <Icon name="chart" />
          </span>
          <strong>{user?.longestStreak || 0}</strong>
          <p>
            Rangkaian terpanjang<small>Rekor pribadi</small>
          </p>
        </article>
      </section>
    </div>
  );
}
