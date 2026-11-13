/**
 * Fits the car into the part of the screen the page copy leaves free.
 *
 * Everything is in CSS pixels of the viewport (the 3D canvas covers the whole
 * viewport). The camera always looks at the car's centre, which projects to the
 * centre of the full view; `setViewOffset` then slides the view so that point
 * lands in the middle of the free area, and `camera.zoom` scales the car to fit.
 */

/** DOM id of the garage copy block, measured to keep the car clear of it. */
export const GARAGE_COPY_ID = "garage-copy";

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PageLayout {
  width: number;
  height: number;
  /** Bottom edge of the header. */
  headerBottom: number;
  /** Bounding box of the garage copy (title and text). */
  copy: ScreenRect;
  /** Top edge of the footer. */
  footerTop: number;
}

export interface CameraLens {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Camera distance from the car's centre, metres. */
  distance: number;
}

export interface Framing {
  zoom: number;
  /** Arguments for `camera.setViewOffset(width, height, offsetX, offsetY, width, height)`. */
  offsetX: number;
  offsetY: number;
  /** The free area the car was fitted into (for tests and debugging). */
  area: ScreenRect;
}

/**
 * Screen-space extent of the car in metres, generous enough for any orbit angle:
 * the width is its footprint diagonal (~4.7 m × 1.95 m), the height covers the
 * body, the tilt of an elevated camera and the contact shadow.
 */
export const CAR_SCREEN_SIZE = { width: 5.2, height: 2.1 };

const EDGE = 24; // keep clear of the screen edge
const GAP = 24; // keep clear of the copy
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.1;
/** How much smaller the car may be beside the copy before it moves above it instead. */
const PREFER_BESIDE = 1.3;

function size(rect: ScreenRect) {
  return { w: Math.max(0, rect.right - rect.left), h: Math.max(0, rect.bottom - rect.top) };
}

/** Zoom at which the car exactly fills `area` (unclamped). */
function zoomToFill(area: ScreenRect, pixelsPerMetre: number): number {
  const { w, h } = size(area);
  return Math.min(w / (CAR_SCREEN_SIZE.width * pixelsPerMetre), h / (CAR_SCREEN_SIZE.height * pixelsPerMetre));
}

export function fitCar(layout: PageLayout, lens: CameraLens): Framing {
  const { width, height, headerBottom, copy, footerTop } = layout;
  // Pixels per metre at the car's centre with zoom = 1.
  const pixelsPerMetre = height / 2 / (lens.distance * Math.tan((lens.fov * Math.PI) / 360));

  const candidates: ScreenRect[] = [
    // Beside the copy: wide screens.
    { left: Math.max(copy.right + GAP, EDGE), top: headerBottom, right: width - EDGE, bottom: footerTop },
    // Above the copy: narrow screens.
    { left: EDGE, top: headerBottom, right: width - EDGE, bottom: copy.top - GAP },
  ];
  // Beside the copy is the intended composition; move above it only when that shows
  // the car clearly bigger (narrow and portrait screens). Zooms are compared capped.
  const [beside, above] = candidates.map((c) => Math.min(MAX_ZOOM, zoomToFill(c, pixelsPerMetre)));
  let [area, best] = beside * PREFER_BESIDE >= above ? [candidates[0], beside] : [candidates[1], above];

  // No usable space (e.g. a very short landscape phone): use the top half and let the copy overlap.
  if (best < MIN_ZOOM) {
    area = { left: EDGE, top: headerBottom, right: width - EDGE, bottom: Math.max(headerBottom + 1, height / 2) };
    best = zoomToFill(area, pixelsPerMetre);
  }

  const centreX = (area.left + area.right) / 2;
  const centreY = (area.top + area.bottom) / 2;
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, best)),
    offsetX: width / 2 - centreX,
    offsetY: height / 2 - centreY,
    area,
  };
}
