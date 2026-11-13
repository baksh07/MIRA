import { ExteriorOnly } from "@/components/garage/ExteriorOnly";

export function AppFooter() {
  return (
    // The footer box lets pointer events through to the 3D scene; its content takes them while shown.
    <footer className="pointer-events-none px-6 py-5 text-xs leading-relaxed text-brushed sm:px-10">
      <ExteriorOnly>
        <p className="max-w-[70ch]">
          MIRA is an independent portfolio project. It is not affiliated with,
          endorsed by, or sponsored by BMW AG. All vehicle signals are simulated.
        </p>
        <p className="mt-1 max-w-[70ch]">
          3D model:{" "}
          <a
            href="https://sketchfab.com/3d-models/bmw-m2-g87-free-125412579b244790b27b2a7839527c6e"
            className="underline decoration-brushed/50 underline-offset-2 hover:text-halogen"
          >
            “BMW M2 g87 [Free]”
          </a>{" "}
          by Black Snow,{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            className="underline decoration-brushed/50 underline-offset-2 hover:text-halogen"
          >
            CC BY 4.0
          </a>
          . Modified: badges removed, hidden parts dropped, compressed.
        </p>
      </ExteriorOnly>
    </footer>
  );
}
