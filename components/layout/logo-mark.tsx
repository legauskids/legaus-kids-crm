export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Legaus Kids">
      <rect width="100" height="100" rx="24" fill="#00a99d" />
      <rect x="28" y="22" width="15" height="42" rx="6" fill="#ffffff" />
      <rect x="28" y="51" width="34" height="15" rx="6" fill="#ffffff" />
      <circle cx="74" cy="32" r="11" fill="#f15a24" />
      <circle cx="70" cy="28" r="2.5" fill="#ffffff" opacity="0.65" />
    </svg>
  );
}
