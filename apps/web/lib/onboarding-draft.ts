export interface OnboardingDraft {
  interests?: string[];
  pace?: 'CASUAL' | 'REGULAR' | 'INTENSIVE';
}

const STORAGE_KEY = 'edisco_onboarding_draft';

export function getOnboardingDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return {};
  try {
    const item = sessionStorage.getItem(STORAGE_KEY);
    return item ? JSON.parse(item) : {};
  } catch {
    return {};
  }
}

export function setOnboardingDraft(draft: OnboardingDraft) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function updateOnboardingDraft(updates: Partial<OnboardingDraft>) {
  const current = getOnboardingDraft();
  setOnboardingDraft({ ...current, ...updates });
}

export function clearOnboardingDraft() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
