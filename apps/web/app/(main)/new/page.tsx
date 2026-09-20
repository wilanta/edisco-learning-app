'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '@/components/app-shell';
import { Icon, type IconName } from '@/components/icons';
import { apiFetch, translateApiMessage } from '@/lib/api-client';

const CATEGORIES = [
  'PROGRAMMING',
  'LANGUAGE',
  'MATH',
  'SCIENCE',
  'ENGINEERING',
  'GENERAL',
] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  PROGRAMMING: 'Pemrograman',
  LANGUAGE: 'Bahasa',
  MATH: 'Matematika',
  SCIENCE: 'Sains',
  ENGINEERING: 'Teknik',
  GENERAL: 'Umum',
};
const TOPICS: {
  title: string;
  category: (typeof CATEGORIES)[number];
  icon: IconName;
  subtitle: string;
}[] = [
  {
    title: 'Pengembangan Web',
    category: 'PROGRAMMING',
    icon: 'code',
    subtitle: 'Bangun situs web modern',
  },
  {
    title: 'Sains Data',
    category: 'MATH',
    icon: 'chart',
    subtitle: 'Analisis dan visualisasikan data',
  },
  {
    title: 'Pembelajaran Mesin',
    category: 'PROGRAMMING',
    icon: 'target',
    subtitle: 'Pelajari dasar-dasar AI',
  },
  {
    title: 'Pengembangan Aplikasi Seluler',
    category: 'PROGRAMMING',
    icon: 'laptop',
    subtitle: 'Bangun aplikasi seluler yang bermanfaat',
  },
  {
    title: 'Bahasa Spanyol Sehari-hari',
    category: 'LANGUAGE',
    icon: 'message',
    subtitle: 'Berbicara dengan percaya diri',
  },
  {
    title: 'Dasar-dasar Fisika',
    category: 'SCIENCE',
    icon: 'flask',
    subtitle: 'Pahami dunia di sekitarmu',
  },
];

export default function NewLessonPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [jobId, setJobId] = useState('');
  const suggestions = useMemo(() => {
    const interestText = (user?.interests || []).join(' ').toLowerCase();
    const relevant = (title: string) =>
      interestText.includes(
        title.split(' ')[0]?.toLowerCase() || title.toLowerCase(),
      );
    return [...TOPICS]
      .sort((a, b) => Number(relevant(b.title)) - Number(relevant(a.title)))
      .slice(0, 5);
  }, [user]);
  const chooseTopic = (
    title: string,
    nextCategory: (typeof CATEGORIES)[number],
  ) => {
    setTopic(title);
    setCategory(nextCategory);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topic.trim() || !category) return;
    setLoading(true);
    setError('');
    setStatus('Mengirim idemu…');
    try {
      const response = await apiFetch<{ jobId: string }>('/lessons/generate', {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim(), category }),
      });
      setJobId(response.jobId);
      setStatus('Merancang pelajaran khusus untukmu…');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Tidak dapat membuat pelajaran',
      );
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!jobId) return;
    const poll = window.setInterval(async () => {
      try {
        const result = await apiFetch<{
          status: string;
          resultUserLessonId?: string;
          errorMessage?: string;
        }>(`/lessons/generate/${jobId}`);
        if (result.status === 'DONE') {
          window.clearInterval(poll);
          setStatus('Pelajaranmu sudah siap!');
          router.push(
            result.resultUserLessonId
              ? `/lesson/${result.resultUserLessonId}`
              : '/track',
          );
        } else if (result.status === 'FAILED') {
          window.clearInterval(poll);
          setError(
            result.errorMessage
              ? translateApiMessage(result.errorMessage)
              : 'Pembuatan pelajaran gagal',
          );
          setLoading(false);
          setJobId('');
        }
      } catch (caught) {
        window.clearInterval(poll);
        setError(
          caught instanceof Error
            ? caught.message
            : 'Tidak dapat memeriksa proses pembuatan',
        );
        setLoading(false);
      }
    }, 2500);
    return () => window.clearInterval(poll);
  }, [jobId, router]);
  const exhausted = (user?.freeGenerationsLeft ?? 0) <= 0;
  return (
    <div className="new-page page-wrap">
      <div className="new-layout">
        <section>
          <h1 className="page-title">Apa yang ingin kamu pelajari?</h1>
          <p className="page-subtitle">
            Jelaskan topik, keterampilan, atau tujuanmu. Kami akan membantumu
            memulai.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {exhausted && (
            <div className="alert error">
              Kamu telah menggunakan seluruh kesempatan membuat pelajaran.
              Pelajaran yang ada tetap dapat diakses kapan saja.
            </div>
          )}
          <form className="topic-composer surface scenery" onSubmit={submit}>
            <label htmlFor="topic" className="sr-only">
              Topik pembelajaran
            </label>
            <textarea
              id="topic"
              disabled={loading || exhausted}
              required
              maxLength={2000}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Ketik di sini…"
            />
            <div>
              {/* <span className="composer-plus">
                <Icon name="plus-square" />
              </span> */}
              <label className="level-select">
                <span className="sr-only">Kategori</span>
                <select
                  aria-label="Kategori pelajaran"
                  value={category}
                  disabled={loading || exhausted}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="" disabled>
                    Pilih kategori
                  </option>
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {CATEGORY_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={loading || exhausted || !topic.trim() || !category}
                aria-label="Buat pelajaran"
              >
                <Icon name="arrow-up" />
              </button>
            </div>
            {loading && (
              <p className="generation-status">
                <i />
                {status}
              </p>
            )}
          </form>
          <section className="trending">
            <header>
              <div>
                <h2 className="section-title">Sedang Tren</h2>
                <p className="page-subtitle">Topik populer untuk memulai.</p>
              </div>
            </header>
            <div className="trend-grid">
              {TOPICS.slice(0, 4).map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => chooseTopic(item.title, item.category)}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </span>
                  <Icon name={item.icon} />
                  <i>
                    <Icon name="plus-square" />
                  </i>
                </button>
              ))}
            </div>
          </section>
        </section>
        <aside className="new-aside surface">
          <h2>Disarankan untukmu</h2>
          {suggestions.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => chooseTopic(item.title, item.category)}
            >
              <span>
                <Icon name={item.icon} />
              </span>
              <p>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </p>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
