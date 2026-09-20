import type { ReactNode } from 'react';
import { Brand, Mark } from './brand';

export function OnboardingFrame({
  children,
  step,
  total = 6,
  compactStep,
}: {
  children: ReactNode;
  step?: number;
  total?: number;
  compactStep?: string;
}) {
  return (
    <main className="onboarding-page scenery">
      {step && (
        <header className="onboarding-header">
          <Brand />
          <div
            className="onboarding-progress"
            role="progressbar"
            aria-label={`Langkah ${step} dari ${total}`}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step}
          >
            <span>
              <i style={{ width: `${(step / total) * 100}%` }} />
            </span>
            <b className="desktop-step">
              {step} / {total}
            </b>
            <b className="mobile-step">
              {compactStep || `${Math.min(step - 1, 3)}/3`}
            </b>
          </div>
        </header>
      )}
      {children}
    </main>
  );
}

export function BrandIllustration({ lines = 4 }: { lines?: number }) {
  return (
    <div className="brand-illustration" aria-hidden="true">
      <Mark />
      {['one', 'two', 'three'].slice(0, Math.max(0, lines - 3)).map((key) => (
        <i key={key} />
      ))}
    </div>
  );
}

export function PreparationScreen() {
  return (
    <OnboardingFrame>
      <div className="preparation-screen">
        <BrandIllustration lines={5} />
        <h1>Menyiapkan semuanya untukmu</h1>
        <p>Sebentar lagi! Kami sedang menyiapkan pengalaman belajarmu.</p>
        <div
          className="wave-loader"
          role="status"
          aria-label="Sedang menyiapkan semuanya"
        >
          {['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map(
            (key) => (
              <i key={key} />
            ),
          )}
        </div>
        <small>Sedang menyiapkan semuanya…</small>
      </div>
    </OnboardingFrame>
  );
}
