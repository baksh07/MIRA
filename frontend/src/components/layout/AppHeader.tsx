export function AppHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-5 sm:px-10">
      <span className="text-lg font-extrabold tracking-wide [font-stretch:125%]">
        MIRA
      </span>

      {/* Driver selection arrives in Phase 4; until then no profile is active. */}
      <p className="flex items-center gap-2 text-sm text-brushed">
        <span
          aria-hidden="true"
          className="size-2 rounded-full border border-brushed"
        />
        No driver selected
      </p>
    </header>
  );
}
