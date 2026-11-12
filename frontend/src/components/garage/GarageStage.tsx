/**
 * The showroom stage. In Phase 2 the 3D vehicle canvas mounts inside the
 * spotlight area; until then the stage shows the empty, lit parking spot.
 */
export function GarageStage() {
  return (
    <section
      aria-labelledby="stage-title"
      className="relative isolate flex flex-1 flex-col justify-end overflow-hidden px-6 pb-10 sm:px-10 sm:pb-14"
    >
      {/*
        Spotlight pool on the floor (the car's turntable), with the ambient light
        catching its rim. Centred above the text on small screens, set to the
        right of it on wider ones.
      */}
      <div
        aria-hidden="true"
        className="animate-spotlight-on absolute left-1/2 top-[30%] -z-10 h-[22vh] w-[min(760px,130vw)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] lg:left-[64%] lg:top-[42%] lg:h-[30vh] bg-[radial-gradient(closest-side,rgb(238_240_242/0.13),rgb(238_240_242/0.04)_70%,transparent)] shadow-[0_1px_0_0_rgb(90_169_255/0.45),0_18px_60px_-20px_rgb(90_169_255/0.35)]"
      />

      <div className="max-w-[60ch]">
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
          The 3D garage is being built. The car will park in the spotlight.
        </p>
      </div>
    </section>
  );
}
