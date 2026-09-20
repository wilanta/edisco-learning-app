'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Brand } from '@/components/brand';
import { Icon } from '@/components/icons';
import { BrandIllustration, OnboardingFrame } from '@/components/onboarding-ui';

export default function WelcomePage() {
  const [introSeen, setIntroSeen] = useState(false);

  if (introSeen) {
    return (
      <OnboardingFrame step={2} compactStep="1/3">
        <div className="onboarding-grid">
          <section className="onboarding-copy">
            <span className="eyebrow">Langkah 2 dari 6</span>
            <h1>
              Selamat datang di <em>Edisco</em>
            </h1>
            <p>
              Belajar, berlatih, dan berkembang melalui pelajaran interaktif
              yang dirancang sesuai tujuanmu.
            </p>
            <div className="onboarding-actions">
              <Link className="primary-button" href="/interests">
                Selanjutnya <Icon name="arrow-right" width={22} />
              </Link>
            </div>
          </section>
          <BrandIllustration lines={5} />
        </div>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame>
      <div className="welcome-stage">
        <Brand />
        <div className="welcome-center">
          <div className="welcome-center-inner">
            <BrandIllustration />
            <div className="welcome-copy">
              <h1>
                Pelajari Apa Saja <em>dari Dasar</em>
              </h1>
              <p>
                Belajar sesuai ritmemu dengan jalur yang jelas, pelajaran
                interaktif, dan kemajuan yang nyata.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => setIntroSeen(true)}
              >
                Mulai <Icon name="arrow-right" width={24} />
              </button>
              <span className="onboarding-login">
                Sudah belajar bersama kami? <Link href="/login">Masuk</Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </OnboardingFrame>
  );
}
