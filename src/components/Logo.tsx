export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="url(#abg)" />
      <path
        d="M5 20.5l5-6 4 3.5 5.5-8L27 12"
        stroke="#06231e"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="12" r="2.4" fill="#06231e" />
      <defs>
        <linearGradient id="abg" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#00e6c3" />
          <stop offset="1" stopColor="#00a892" />
        </linearGradient>
      </defs>
    </svg>
  );
}
