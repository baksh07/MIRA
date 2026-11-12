import { GarageStage } from "@/components/garage/GarageStage";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader } from "@/components/layout/AppHeader";

export default function Home() {
  return (
    // The showroom wall runs behind the header and falls off into the floor.
    <div className="flex flex-1 flex-col bg-[linear-gradient(to_bottom,var(--color-wall)_0%,var(--color-wall)_40%,var(--color-floor)_80%)]">
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <GarageStage />
      </main>
      <AppFooter />
    </div>
  );
}
