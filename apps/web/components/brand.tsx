export function Mark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup">
      <Mark />
      {!compact && (
        <div>
          <strong>Edisco</strong>
          <span>Pelajari Apa Saja</span>
        </div>
      )}
    </div>
  );
}
