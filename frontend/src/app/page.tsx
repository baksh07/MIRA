import { GarageScene } from "@/components/garage/GarageScene";
import { GarageStage } from "@/components/garage/GarageStage";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader } from "@/components/layout/AppHeader";
import { DemoGuide } from "@/components/layout/DemoGuide";

export default function Home() {
  return (
    // The 3D garage fills the page behind the chrome. The gradient (wall falling
    // off into the floor) shows while the scene loads or if WebGL is unavailable.
    <div className="relative isolate flex min-h-dvh w-full flex-1 flex-col bg-[linear-gradient(to_bottom,var(--color-wall)_0%,var(--color-wall)_40%,var(--color-floor)_80%)]">
      <GarageScene />
      <AppHeader />
      {/* Pointer events pass through to the 3D scene except on the copy itself. */}
      <main className="pointer-events-none flex flex-1 flex-col">
        <GarageStage />
      </main>
      <AppFooter />
      <DemoGuide />
    </div>
  );
}
