// Subtle, high-end backdrop for the whole app — a faint grid that fades out and
// two soft brand-coloured glows. Sits behind all content and blends with the
// theme (uses theme tokens, so it works in light and dark). Static (no motion)
// so it never distracts while trading.
export function AppBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* faint grid, masked so it only shows near the top */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.55) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.55) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(ellipse 90% 55% at 50% -5%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 55% at 50% -5%, #000 35%, transparent 80%)",
        }}
      />
      {/* soft glows */}
      <div className="absolute -top-40 left-1/4 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand/10 blur-[130px]" />
      <div className="absolute top-1/3 -right-40 h-[30rem] w-[30rem] rounded-full bg-indigo-500/10 blur-[130px]" />
      <div className="absolute -bottom-40 left-1/3 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/[0.06] blur-[130px]" />
    </div>
  );
}
