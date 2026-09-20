import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Edisco | Pelajari Apa Saja yang Kamu Inginkan',
    template: '%s | Edisco',
  },
  description: 'Pelajari apa saja, satu pelajaran dalam satu waktu.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        {children}
        <Script id="edisco-theme" strategy="beforeInteractive">
          {`try{var s=localStorage.getItem('edisco_theme');document.documentElement.dataset.theme=s==='DARK'?'dark':s==='LIGHT'?'light':matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`}
        </Script>
      </body>
    </html>
  );
}
