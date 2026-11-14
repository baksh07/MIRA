import { describe, expect, it } from "vitest";
import { CAR_SCREEN_SIZE, type PageLayout, fitCar } from "./carFraming";

const lens = { fov: 32, distance: 9.2 };

/** On-screen size of the car for a framing result. */
function carPixels(height: number, zoom: number) {
  const pixelsPerMetre = height / 2 / (lens.distance * Math.tan((lens.fov * Math.PI) / 360));
  return { w: CAR_SCREEN_SIZE.width * pixelsPerMetre * zoom, h: CAR_SCREEN_SIZE.height * pixelsPerMetre * zoom };
}

/** Where the car's centre lands on screen. */
function carCentre(layout: PageLayout, offsetX: number, offsetY: number) {
  return { x: layout.width / 2 - offsetX, y: layout.height / 2 - offsetY };
}

// Copy rectangles measured in the browser (layout matrix, 2026-11-13).
const desktop: PageLayout = {
  width: 1920,
  height: 1080,
  headerBottom: 68,
  copy: { left: 40, top: 614, right: 590, bottom: 902 },
  footerTop: 990,
};
const wideAndShort: PageLayout = {
  width: 1533,
  height: 730,
  headerBottom: 68,
  copy: { left: 40, top: 264, right: 590, bottom: 552 },
  footerTop: 640,
};
const laptop: PageLayout = {
  width: 1440,
  height: 900,
  headerBottom: 68,
  copy: { left: 40, top: 434, right: 590, bottom: 722 },
  footerTop: 790,
};
const phone: PageLayout = {
  width: 390,
  height: 844,
  headerBottom: 68,
  copy: { left: 24, top: 437, right: 366, bottom: 663 },
  footerTop: 700,
};

describe("fitCar", () => {
  it.each([
    ["desktop", desktop],
    ["a laptop", laptop],
    ["wide and short (125% scaling)", wideAndShort],
  ])("puts the car beside the copy on %s, fully on screen", (_, layout) => {
    const framing = fitCar(layout, lens);
    expect(framing.area.left).toBeGreaterThan(layout.copy.right);

    const car = carPixels(layout.height, framing.zoom);
    const centre = carCentre(layout, framing.offsetX, framing.offsetY);
    expect(centre.x - car.w / 2).toBeGreaterThanOrEqual(layout.copy.right);
    expect(centre.x + car.w / 2).toBeLessThanOrEqual(layout.width);
    expect(centre.y - car.h / 2).toBeGreaterThanOrEqual(layout.headerBottom);
    expect(centre.y + car.h / 2).toBeLessThanOrEqual(layout.footerTop);
  });

  it("puts the car above the copy on a phone, fully on screen", () => {
    const framing = fitCar(phone, lens);
    expect(framing.area.bottom).toBeLessThan(phone.copy.top);

    const car = carPixels(phone.height, framing.zoom);
    const centre = carCentre(phone, framing.offsetX, framing.offsetY);
    expect(centre.x - car.w / 2).toBeGreaterThanOrEqual(0);
    expect(centre.x + car.w / 2).toBeLessThanOrEqual(phone.width);
    expect(centre.y + car.h / 2).toBeLessThanOrEqual(phone.copy.top);
  });

  it("never zooms beyond the limits", () => {
    const huge = fitCar({ ...desktop, width: 7680, height: 4320, copy: { left: 40, top: 4000, right: 590, bottom: 4200 }, footerTop: 4300 }, lens);
    expect(huge.zoom).toBeLessThanOrEqual(1.1);
    const cramped = fitCar({ width: 844, height: 390, headerBottom: 68, copy: { left: 40, top: 68, right: 590, bottom: 320 }, footerTop: 390 }, lens);
    expect(cramped.zoom).toBeGreaterThanOrEqual(0.25);
  });
});
