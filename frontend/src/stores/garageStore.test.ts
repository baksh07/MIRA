import { beforeEach, describe, expect, it } from "vitest";
import { useGarageStore } from "./garageStore";

const initial = useGarageStore.getState();
const state = () => useGarageStore.getState();

beforeEach(() => {
  useGarageStore.setState(initial, true);
});

describe("garage store", () => {
  it("starts outside the car with doors closed and the turntable running", () => {
    expect(state().view).toBe("exterior");
    expect(state().doors).toEqual({ left: false, right: false });
    expect(state().interacted).toBe(false);
  });

  it("toggles each door independently and stops the turntable", () => {
    state().toggleDoor("right");
    expect(state().doors).toEqual({ left: false, right: true });
    expect(state().interacted).toBe(true);
    state().toggleDoor("left");
    state().toggleDoor("right");
    expect(state().doors).toEqual({ left: true, right: false });
  });

  it("enters through the driver's door and closes it once seated", () => {
    state().enterCockpit();
    expect(state().view).toBe("entering");
    expect(state().doors.left).toBe(true);

    state().finishTransition();
    expect(state().view).toBe("cockpit");
    expect(state().doors.left).toBe(false);
  });

  it("leaves the cockpit back to the garage", () => {
    state().enterCockpit();
    state().finishTransition();
    state().exitCockpit();
    expect(state().view).toBe("exiting");
    state().finishTransition();
    expect(state().view).toBe("exterior");
  });

  it("ignores door toggles while not standing in the garage", () => {
    state().enterCockpit();
    state().toggleDoor("right");
    expect(state().doors.right).toBe(false);
    state().finishTransition();
    state().toggleDoor("left");
    expect(state().doors.left).toBe(false);
  });

  it("ignores out-of-order transitions", () => {
    state().exitCockpit(); // not seated
    expect(state().view).toBe("exterior");
    state().finishTransition(); // nothing in progress
    expect(state().view).toBe("exterior");
    state().enterCockpit();
    state().enterCockpit(); // already entering
    expect(state().view).toBe("entering");
  });
});
