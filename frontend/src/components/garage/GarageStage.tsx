import { ExteriorOnly } from "./ExteriorOnly";

/**
 * The copy laid over the 3D garage. The car itself renders in GarageScene,
 * which sits behind the whole page. The copy steps aside while in the car.
 */
export function GarageStage() {
  return (
    <section
      aria-labelledby="stage-title"
      className="flex flex-1 flex-col justify-end px-6 pb-10 sm:px-10 sm:pb-14"
    >
      <ExteriorOnly className="max-w-[60ch]">
        <h1
          id="stage-title"
          className="text-[clamp(3.5rem,14vw,10rem)] leading-[0.85] font-black tracking-tight [font-stretch:125%]"
        >
          MIRA
        </h1>
        <p className="mt-4 text-lg font-medium sm:text-xl">
          Memory-Informed Road Assistant
        </p>
        <p className="mt-3 text-base leading-relaxed text-brushed">
          A voice assistant for a simulated car. It learns how each driver likes
          the cabin set up and gets it ready when they come back.
        </p>
        <p className="mt-6 text-sm text-brushed">
          Drag to walk around the car. Open a door, then get in.
        </p>
      </ExteriorOnly>
    </section>
  );
}
