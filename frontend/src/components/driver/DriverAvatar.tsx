import type { Driver } from "@/types/driver";

/** Original line-art portraits for the two demo characters (no photos, no real faces). */
export function DriverAvatar({ gender, className = "" }: { gender: Driver["gender"]; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      {/* shoulders */}
      <path d="M22 116c4-22 20-32 38-32s34 10 38 32" strokeLinecap="round" />
      {gender === "female" ? (
        <>
          {/* long hair framing the face */}
          <path d="M34 66c-6-30 6-50 26-50s32 20 26 50c-2 10-6 16-10 20" strokeLinecap="round" />
          <path d="M34 66c2 10 6 16 10 20" strokeLinecap="round" />
          <ellipse cx="60" cy="54" rx="18" ry="22" />
          <path d="M43 44c8-2 18-8 22-16 4 8 10 12 13 14" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="60" cy="54" rx="19" ry="23" />
          {/* short hair */}
          <path d="M41 48c-2-18 8-28 20-28s22 8 20 26c-6-6-14-10-24-10-6 0-12 4-16 12z" strokeLinejoin="round" />
          <path d="M50 70c6 4 14 4 20 0" strokeLinecap="round" opacity="0.6" />
        </>
      )}
      <circle cx="53" cy="55" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="67" cy="55" r="1.6" fill="currentColor" stroke="none" />
      <path d="M55 66c3 2 7 2 10 0" strokeLinecap="round" />
    </svg>
  );
}
