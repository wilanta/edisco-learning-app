'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, removeAuthToken } from '../../../lib/api-client';
import Link from 'next/link';

type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  xp: number;
};

type LeagueData = {
  weekStartDate: string;
  myRank: number | null;
  myXp: number;
  leaderboard: LeaderboardEntry[];
};

export default function LeaguePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetch('/users/me'), apiFetch<LeagueData>('/league/weekly')])
      .then(([userData, data]) => {
        setUser(userData);
        setLeagueData(data || null);
        setLoading(false);
      })
      .catch(() => {
        removeAuthToken();
        router.replace('/login');
      });
  }, [router]);

  if (loading) return <div className="p-8 max-w-4xl mx-auto">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Weekly League</h1>
        <div className="space-x-4">
          <Link
            href="/track"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            &larr; Back to Tracks
          </Link>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl shadow-lg p-6 mb-8 text-white">
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="text-blue-200 text-sm font-medium uppercase tracking-wider mb-1">
              My Rank
            </div>
            <div className="text-3xl font-bold">
              {leagueData?.myRank ? `#${leagueData.myRank}` : '-'}
            </div>
          </div>
          <div>
            <div className="text-blue-200 text-sm font-medium uppercase tracking-wider mb-1">
              Total XP
            </div>
            <div className="text-3xl font-bold">{user?.totalXp || 0}</div>
          </div>
          <div>
            <div className="text-blue-200 text-sm font-medium uppercase tracking-wider mb-1">
              Current Streak
            </div>
            <div className="text-3xl font-bold">
              {user?.currentStreak || 0} <span className="text-xl">🔥</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">Leaderboard</h2>
          <div className="text-sm text-gray-500">
            Week of {leagueData?.weekStartDate}
          </div>
        </div>

        {leagueData?.leaderboard && leagueData.leaderboard.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {leagueData.leaderboard.map((entry) => (
              <div
                key={entry.userId}
                className={`flex items-center p-4 transition-colors ${
                  entry.userId === user?.id
                    ? 'bg-blue-50 hover:bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-12 text-center flex-shrink-0">
                  <span
                    className={`text-lg font-bold ${
                      entry.rank === 1
                        ? 'text-yellow-500'
                        : entry.rank === 2
                          ? 'text-gray-400'
                          : entry.rank === 3
                            ? 'text-amber-600'
                            : 'text-gray-500'
                    }`}
                  >
                    {entry.rank}
                  </span>
                </div>
                <div className="ml-4 flex-grow">
                  <div className="font-medium text-gray-900 flex items-center">
                    {entry.name}
                    {entry.userId === user?.id && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        You
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0 text-right">
                  <div className="font-bold text-gray-700">{entry.xp} XP</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            No one has earned XP this week yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}
