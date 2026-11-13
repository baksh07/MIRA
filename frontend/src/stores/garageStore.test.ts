import { beforeEach, describe, expect, it } from "vitest";
import { useGarageStore } from "./garageStore";

const initial = useGarageStore.getState();
const state = () => useGarageStore.getState();

beforeEach(() => {
  useGarageStore.setState(initial, true);
});

describe("garage store", () => {
  it("starts outside the car with the turntable running", () => {
    expect(state().view).toBe("exterior");
    expect(state().interacted).toBe(false);
  });

  it("enters the cockpit and stops the turntable", () => {
    state().enterCockpit();
    expect(state().view).toBe("entering");
    expect(state().interacted).toBe(true);
    expect(state().finishTransition()).toBe("cockpit");
  });

  it("leaves the cockpit back to the garage", () => {
    state().enterCockpit();
    state().finishTransition();
    state().exitCockpit();
    expect(state().view).toBe("exiting");
    expect(state().finishTransition()).toBe("exterior");
  });

  it("ignores out-of-order transitions", () => {
    state().exitCockpit(); // not seated
    expect(state().view).toBe("exterior");
    expect(state().finishTransition()).toBe("exterior"); // nothing in progress
    state().enterCockpit();
    state().enterCockpit(); // already entering
    expect(state().view).toBe("entering");
  });
});
