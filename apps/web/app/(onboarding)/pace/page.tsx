'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { OnboardingFrame } from '@/components/onboarding-ui';
import {
  getOnboardingDraft,
  updateOnboardingDraft,
} from '@/lib/onboarding-draft';

type Pace = 'CASUAL' | 'REGULAR' | 'INTENSIVE';
const PACES: {
  id: string;
  value: Pace;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    id: 'quick',
    value: 'CASUAL',
    label: '1–3 menit sehari',
    description: 'Mulai dengan cepat',
    icon: 'leaf',
  },
  {
    id: 'simple',
    value: 'REGULAR',
    label: '5–10 menit sehari',
    description: 'Tetap sederhana',
    icon: 'clock',
  },
  {
    id: 'progress',
    value: 'INTENSIVE',
    label: '15–20 menit sehari',
    description: 'Bangun kemajuan nyata',
    icon: 'target',
  },
  {
    id: 'further',
    value: 'INTENSIVE',
    label: '30+ menit sehari',
    description: 'Melangkah lebih jauh',
    icon: 'rocket',
  },
];

export default function PacePage() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    const draft = getOnboardingDraft();
    if (!draft.interests?.length) router.replace('/interests');
    if (draft.pace)
      setSelectedId(
        PACES.find((pace) => pace.value === draft.pace)?.id || 'simple',
      );
  }, [router]);
  const next = () => {
    const selected = PACES.find((pace) => pace.id === selectedId);
    if (!selected) return;
    updateOnboardingDraft({ pace: selected.value });
    router.push('/register');
  };

  return (
    <OnboardingFrame step={4} compactStep="2/3">
      <div className="onboarding-grid">
        <section className="onboarding-copy">
          <span className="eyebrow">Langkah 4 dari 6</span>
          <h1>
            Atur <em>ritme belajarmu</em>
          </h1>
          <p>
            Pilih waktu yang ingin kamu luangkan untuk belajar setiap hari. Kamu
            dapat mengubahnya kapan saja.
          </p>
        </section>
        <section className="onboarding-panel">
          <div className="pace-list">
            {PACES.map((pace) => (
              <button
                key={pace.id}
                type="button"
                className={`pace-card ${selectedId === pace.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(pace.id)}
                aria-pressed={selectedId === pace.id}
              >
                <span className="pace-icon">
                  <Icon name={pace.icon} />
                </span>
                <span>
                  <strong>{pace.label}</strong>
                  <small>{pace.description}</small>
                </span>
                <span className="check-dot">
                  <Icon
                    name={selectedId === pace.id ? 'check' : 'arrow-right'}
                    width={20}
                  />
                </span>
              </button>
            ))}
          </div>
          <div className="onboarding-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!selectedId}
              onClick={next}
            >
              Selanjutnya <Icon name="arrow-right" width={22} />
            </button>
          </div>
        </section>
      </div>
    </OnboardingFrame>
  );
}
