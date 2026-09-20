'use client';

import { useEffect, useState } from 'react';
import { PageSkeleton, useCurrentUser } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { apiFetch } from '@/lib/api-client';

type Entry = { rank: number; userId: string; name: string; xp: number };
type League = {
  weekStartDate: string;
  myRank: number | null;
  myXp: number;
  leaderboard: Entry[];
};

export default function LeaguePage() {
  const { user } = useCurrentUser();
  const [data, setData] = useState<League | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch<League>('/league/weekly')
      .then(setData)
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : 'Tidak dapat memuat liga',
        ),
      );
  }, []);
  if (!data && !error) return <PageSkeleton />;
  return (
    <div className="league-page page-wrap">
      {error && <div className="alert error">{error}</div>}
      <section className="league-hero surface scenery">
        <div>
          <h1>Eliksir mingguanmu</h1>
          <strong>
            {data?.myXp || 0}
            <Icon name="drop" />
          </strong>
          <p>
            Dapatkan eliksir dengan menyelesaikan bagian pelajaran dan teruslah
            naik di papan peringkat mingguan.
          </p>
        </div>
        <span className="trophy-art">
          <Icon name="cup" />
        </span>
      </section>
      <div className="league-layout">
        <section className="surface leaderboard">
          <header>
            <h2>
              Pelajar teratas <small>• Mingguan</small>
            </h2>
            <span>Semua wilayah</span>
          </header>
          {data?.leaderboard.length ? (
            <ol>
              {data.leaderboard.slice(0, 10).map((entry) => (
                <li
                  key={entry.userId}
                  className={entry.userId === user?.id ? 'me' : ''}
                >
                  <b className={`rank rank-${entry.rank}`}>
                    {entry.rank === 1 ? '♛' : entry.rank}
                  </b>
                  <span className="leader-avatar">
                    <Icon name="user" />
                  </span>
                  <p>
                    <strong>{entry.name}</strong>
                    <small>{entry.xp} elixir</small>
                  </p>
                  <em>
                    {entry.rank <= 3 ? `#${entry.rank}` : `#${entry.rank}`}
                  </em>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              <Icon name="star" />
              <h3>Liga masih terbuka lebar</h3>
              {/* <p>
                Complete a lesson to become this week’s first ranked learner.
              </p> */}
            </div>
          )}
        </section>
        <aside>
          <section className="surface your-rank">
            <h2>Peringkatmu</h2>
            <div>
              <span className="leader-avatar">
                <Icon name="user" />
              </span>
              <p>
                <small>Kamu</small>
                <strong>{user?.name || 'Pelajar'}</strong>
                <span>{data?.myXp || 0} elixir</span>
              </p>
              <b>{data?.myRank ? `#${data.myRank}` : '—'}</b>
            </div>
          </section>
          <section className="surface reward-note">
            <Icon name="star" />
            <p>
              <strong>Kemajuan mingguan</strong>
              <span>
                Pekan baru dimulai setiap Senin. Terus belajar untuk naik
                peringkat.
              </span>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
