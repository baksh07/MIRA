import { describe, expect, it } from "vitest";
import { AVENUES, FIRST_STREET, STREETS, destinationPoint, planRoute, pointAlong, routeLength } from "./city";

const onRoad = (p: { x: number; z: number }) =>
  AVENUES.some((x) => Math.abs(p.x - x) < 0.01) ||
  STREETS.some((z) => Math.abs(p.z - z) < 0.01) ||
  (p.x === 0 && p.z < FIRST_STREET);

describe("city routes", () => {
  it("maps a destination name to the same intersection every time", () => {
    expect(destinationPoint("Munich Airport")).toEqual(destinationPoint("munich airport "));
    expect(destinationPoint("Munich Airport")).not.toEqual({ x: 0, z: FIRST_STREET });
  });

  it("drives out of the garage and only along roads, with right-angle legs", () => {
    const to = destinationPoint("Marienplatz");
    const route = planRoute({ x: 0, z: 0 }, to);
    expect(route[0]).toEqual({ x: 0, z: 0 });
    expect(route.at(-1)).toEqual(to);
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1], route[i]];
      expect(a.x === b.x || a.z === b.z).toBe(true);
      expect(onRoad(pointAlong([a, b], 0.5 * Math.hypot(b.x - a.x, b.z - a.z)))).toBe(true);
    }
  });

  it("routes from a street position too", () => {
    const route = planRoute({ x: 33, z: STREETS[1] + 1 }, { x: AVENUES[0], z: STREETS[3] });
    expect(route.at(-1)).toEqual({ x: AVENUES[0], z: STREETS[3] });
    expect(routeLength(route)).toBeGreaterThan(100);
  });
});
