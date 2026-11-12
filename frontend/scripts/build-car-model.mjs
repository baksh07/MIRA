/**
 * Builds the garage car model served from public/models.
 *
 * Source: "BMW M2 g87 [Free]" by Black Snow, CC-BY-4.0
 * https://sketchfab.com/3d-models/bmw-m2-g87-free-125412579b244790b27b2a7839527c6e
 *
 * The raw download lives in assets-src/ (git-ignored). This script:
 *   1. Removes manufacturer branding (badge decals, emblem textures, logo regions
 *      of the tyre atlas). MIRA is not affiliated with BMW and ships no BMW marks.
 *   2. Drops drivetrain/suspension parts that are never visible from the garage.
 *   3. Re-encodes textures as WebP (max 1024px) and compresses geometry with meshopt.
 * Doors, hood, trunk, wheels and the steering wheel stay as separate named nodes.
 *
 * Run from frontend/: npm run build:model
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { stat } from "node:fs/promises";

const SOURCE = "assets-src/m2-g87-source.glb";
const OUTPUT = "public/models/coupe.glb";
const PREFIX = "m2g87undg_";

/** Translucent decal materials that only carry badges and lettering. */
const DECAL_MATERIALS = new Set(["CalliperBadge", "Badge_ext", "Interior_Logo"].map((n) => PREFIX + n));
/** Opaque emblem material (hood/trunk roundels, steering-wheel centre): repainted plain. */
const EMBLEM_MATERIAL = PREFIX + "BadgeA";
const EMBLEM_COLOR = { r: 18, g: 18, b: 20 };
/**
 * Tyre atlas regions (fractions of width/height) holding the M logo (a rectangle)
 * and the centre-cap roundel (a circle), shaped to stay clear of the sidewall.
 */
const TYRE_MATERIAL = PREFIX + "Wheel1A_Tire";
const TYRE_LOGO_REGIONS = [
  { shape: "rect", x: 0.01, y: 0.05, w: 0.28, h: 0.12 },
  { shape: "circle", cx: 0.135, cy: 0.865, r: 0.118 },
];

/** Hidden underbody parts plus the badge lettering mesh. */
const REMOVED_NODES =
  /_(driveshaft|halfshafts|transfercase|diff|subframe|swaybar|lowerarm|upperarm|toelink|tierod|steering_rack|fueltank|heatshield|exhaust_[LR]|exh_muffler|transmission|engine_block_bottom|engine_block_generator|header_turbo|reinforcement|strut_F|shock_R|spring_R|hub_[FR]|radfan|lettering_m2)/;

async function solidPng(color) {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: color } }).png().toBuffer();
}

async function paintOverRegions(image, regions) {
  const { width, height } = await sharp(image).metadata();
  // Sample the fill from the atlas background just right of the first region.
  const sample = await sharp(image)
    .extract({ left: Math.round(width * 0.4), top: Math.round(height * 0.01), width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const fill = `rgb(${sample[0]},${sample[1]},${sample[2]})`;
  const shapes = regions.map((r) =>
    r.shape === "circle"
      ? `<circle cx="${r.cx * width}" cy="${r.cy * height}" r="${r.r * width}" fill="${fill}"/>`
      : `<rect x="${r.x * width}" y="${r.y * height}" width="${r.w * width}" height="${r.h * height}" fill="${fill}"/>`,
  );
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join("")}</svg>`);
  return sharp(image).composite([{ input: overlay }]).png().toBuffer();
}

function countTriangles(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      triangles += (indices ? indices.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
    }
  }
  return Math.round(triangles);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const document = await io.read(SOURCE);
const root = document.getRoot();
console.log(`source: ${countTriangles(document)} triangles`);

// 1. Branding.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (DECAL_MATERIALS.has(prim.getMaterial()?.getName())) {
      mesh.removePrimitive(prim);
      prim.dispose();
    }
  }
}
for (const material of root.listMaterials()) {
  const name = material.getName();
  const baseColor = material.getBaseColorTexture();
  if (name === EMBLEM_MATERIAL && baseColor) {
    baseColor.setImage(await solidPng(EMBLEM_COLOR)).setMimeType("image/png");
    material.setNormalTexture(null);
  }
  if (name === TYRE_MATERIAL && baseColor) {
    baseColor.setImage(await paintOverRegions(baseColor.getImage(), TYRE_LOGO_REGIONS)).setMimeType("image/png");
  }
}

// 2. Hidden parts.
for (const node of root.listNodes()) {
  if (REMOVED_NODES.test(node.getName())) node.dispose();
}

// 3. Cleanup and compression (geometry compression last).
await document.transform(
  prune(),
  dedup(),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);

await io.write(OUTPUT, document);
const [before, after] = await Promise.all([stat(SOURCE), stat(OUTPUT)]);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`output: ${countTriangles(document)} triangles, ${mb(before.size)} MB -> ${mb(after.size)} MB (${OUTPUT})`);
