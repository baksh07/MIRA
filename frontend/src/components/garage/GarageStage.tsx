import { GARAGE_COPY_ID } from "./carFraming";
import { ExteriorOnly } from "./ExteriorOnly";
import { WrapPicker } from "./WrapPicker";

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
      <ExteriorOnly id={GARAGE_COPY_ID} className="max-w-[60ch]">
        <h1
          id="stage-title"
          // Sized by width, but also by height so short screens (landscape phones, scaled laptops) keep room for the car.
          className="text-[clamp(3rem,min(14vw,20vh),10rem)] leading-[0.85] font-black tracking-tight [font-stretch:125%]"
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
        <WrapPicker />
      </ExteriorOnly>
    </section>
  );
}
