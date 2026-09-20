'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiFetch, removeAuthToken } from '@/lib/api-client';
import { syncThemeIfNeeded, type ThemePreference } from '@/lib/theme';
import { Brand } from './brand';
import { Icon, type IconName } from './icons';
import { UserAvatar } from './user-avatar';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  theme: ThemePreference;
  pace: 'CASUAL' | 'REGULAR' | 'INTENSIVE' | null;
  interests: string[];
  freeGenerationsLeft: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  onboardingCompletedAt?: string | null;
  createdAt?: string;
  lessonCount?: number;
  completedLessonCount?: number;
  activityDates?: string[];
};

const UserContext = createContext<{
  user: CurrentUser | null;
  refreshUser: () => Promise<void>;
}>({ user: null, refreshUser: async () => undefined });

export function useCurrentUser() {
  return useContext(UserContext);
}

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: '/track', label: 'Jalur', icon: 'layers' },
  { href: '/lesson', label: 'Pelajaran', icon: 'book' },
  { href: '/new', label: 'Baru', icon: 'plus-square' },
  { href: '/league', label: 'Liga', icon: 'star' },
  { href: '/profile', label: 'Profil', icon: 'user' },
];

function ResourceBar({ user }: { user: CurrentUser | null }) {
  return (
    <div
      className="resource-bar"
      role="status"
      aria-label="Sumber daya belajar"
    >
      <span title="Sisa pembuatan pelajaran">
        <Icon name="robot" />
        {user?.freeGenerationsLeft ?? '–'}
      </span>
      <span title="Total pengalaman">
        <Icon name="drop" />
        {user?.totalXp ?? '–'}
      </span>
      <span className="energy" title="Rangkaian belajar saat ini">
        <Icon name="battery" />
        {user?.currentStreak ?? '–'}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const refreshUser = useCallback(async () => {
    const data = await apiFetch<CurrentUser>('/users/me');
    syncThemeIfNeeded(data.theme);
    setUser(data);
  }, []);

  useEffect(() => {
    refreshUser()
      .then(() => setReady(true))
      .catch(() => {
        removeAuthToken();
        router.replace('/login');
      });
  }, [router, refreshUser]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  const logout = () => {
    setProfileMenuOpen(false);
    removeAuthToken();
    router.replace('/welcome');
  };

  const active = (href: string) =>
    href === '/lesson' ? pathname.startsWith('/lesson') : pathname === href;

  return (
    <UserContext.Provider value={{ user, refreshUser }}>
      <div className="app-shell">
        <aside className="desktop-sidebar">
          <Brand />
          <nav aria-label="Navigasi utama">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={active(item.href) ? 'active' : ''}
              >
                <Icon name={item.icon} /> <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-profile-menu" ref={profileMenuRef}>
            {profileMenuOpen && (
              <div className="profile-dropdown" role="menu">
                <Link
                  href="/settings"
                  className="profile-dropdown-item"
                  role="menuitem"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  <Icon name="settings" />
                  <span>Pengaturan</span>
                </Link>
                <button
                  type="button"
                  className="profile-dropdown-item profile-dropdown-logout"
                  role="menuitem"
                  onClick={logout}
                >
                  <Icon name="logout" />
                  <span>Keluar</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className="sidebar-profile"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <UserAvatar
                className="avatar-small"
                name={user?.name || 'Pelajar Edisco'}
                avatarUrl={user?.avatarUrl}
              />
              <span>
                <strong>{user?.name || 'Pelajar'}</strong>
                <small>{user?.email || 'Memuat…'}</small>
              </span>
            </button>
          </div>
        </aside>
        <div className="app-stage">
          <header className="app-topbar">
            <ResourceBar user={user} />
            {/* <button
              className="top-avatar"
              type="button"
              onClick={() => router.push('/profile')}
              aria-label="Open profile"
            >
              {user?.name?.[0]?.toUpperCase() || 'E'}
            </button> */}
          </header>
          <main className="app-content">
            {ready ? children : <PageSkeleton />}
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Navigasi utama">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={active(item.href) ? 'active' : ''}
            >
              <span className="mobile-nav-icon">
                <Icon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </UserContext.Provider>
  );
}

export function PageSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-label="Memuat">
      <i />
      <i />
      <i />
    </div>
  );
}
