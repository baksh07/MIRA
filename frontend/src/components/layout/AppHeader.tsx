import { DriverStatus } from "@/components/driver/DriverStatus";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-5 sm:px-10">
      <span className="text-lg font-extrabold tracking-wide [font-stretch:125%]">MIRA</span>
      <DriverStatus />
    </header>
  );
}
