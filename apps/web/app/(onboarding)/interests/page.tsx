'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { OnboardingFrame } from '@/components/onboarding-ui';
import {
  getOnboardingDraft,
  updateOnboardingDraft,
} from '@/lib/onboarding-draft';

const CATEGORIES: { label: string; icon: IconName }[] = [
  { label: 'Sains', icon: 'flask' },
  { label: 'Matematika', icon: 'calculator' },
  { label: 'Pemrograman', icon: 'code' },
  { label: 'Teknologi', icon: 'laptop' },
  { label: 'Ilmu Sosial', icon: 'people' },
  { label: 'Psikologi', icon: 'leaf' },
  { label: 'Linguistik', icon: 'book' },
  { label: 'Bahasa', icon: 'message' },
  { label: 'Hukum', icon: 'building' },
  { label: 'Lainnya', icon: 'globe' },
];

export default function InterestsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    const interests = getOnboardingDraft().interests || [];
    const labels = CATEGORIES.map((item) => item.label);
    const custom = interests.find((item) => !labels.includes(item));
    setSelected(interests.filter((item) => labels.includes(item)));
    if (custom) {
      setSelected((current) => [...current, 'Lainnya']);
      setOtherText(custom);
    }
  }, []);

  const toggle = (label: string) =>
    setSelected((current) => {
      if (current.includes(label))
        return current.filter((item) => item !== label);
      return current.length >= 3 ? current : [...current, label];
    });
  const next = () => {
    if (!selected.length) return;
    updateOnboardingDraft({
      interests: selected.map((item) =>
        item === 'Lainnya' && otherText.trim() ? otherText.trim() : item,
      ),
    });
    router.push('/pace');
  };

  return (
    <OnboardingFrame step={3} compactStep="1/3">
      <div className="onboarding-grid">
        <section className="onboarding-copy">
          <span className="eyebrow">Langkah 3 dari 6</span>
          <h1>
            Pilih <em>minatmu</em>
          </h1>
          <p>
            Pilih hingga 3 hal yang membuatmu tertarik. Kami akan menyesuaikan
            pengalaman belajarmu.
          </p>
        </section>
        <section className="onboarding-panel">
          <div className="interest-grid">
            {CATEGORIES.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => toggle(item.label)}
                aria-pressed={selected.includes(item.label)}
                className={`interest-card ${selected.includes(item.label) ? 'selected' : ''}`}
              >
                <span className="interest-icon">
                  <Icon name={item.icon} />
                </span>
                {item.label}
              </button>
            ))}
            {selected.includes('Lainnya') && (
              <label className="interest-other">
                <span className="sr-only">Minat lainnya</span>
                <input
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                  placeholder="Ceritakan apa yang ingin kamu pelajari"
                />
              </label>
            )}
          </div>
          <div className="onboarding-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!selected.length}
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
