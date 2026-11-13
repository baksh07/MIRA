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
/**
 * Edits to base-colour textures, keyed by material. Coordinates are fractions of
 * the texture's width/height.
 *   solid:     replace the whole texture with one colour
 *   fill:      paint a rect/circle with the most common colour around its edge
 *   grayscale: remove colour from a region (M-colour stitching and grilles)
 */
const TEXTURE_EDITS = {
  // Hood/trunk roundels and steering-wheel centre: plain dark emblem.
  BadgeA: [{ op: "solid", color: { r: 18, g: 18, b: 20 } }],
  // Tyre atlas: M logo and centre-cap roundel, shaped to stay clear of the sidewall.
  Wheel1A_Tire: [
    { op: "fill", shape: "rect", x: 0.01, y: 0.05, w: 0.28, h: 0.12 },
    { op: "fill", shape: "circle", cx: 0.135, cy: 0.865, r: 0.118 },
  ],
  // Branded digital displays: blanked; MIRA draws its own cluster in the cockpit.
  screen: [{ op: "solid", color: { r: 4, g: 5, b: 7 } }],
  digidash_screen: [{ op: "solid", color: { r: 4, g: 5, b: 7 } }],
  // Speaker grilles printed in M colours.
  Grille2: [{ op: "grayscale" }],
  // Interior atlases: model logos and M-colour stitching.
  Interior_Signs: [
    { op: "fill", shape: "rect", x: 0.0, y: 0.13, w: 0.32, h: 0.075 },
    { op: "fill", shape: "rect", x: 0.7, y: 0.125, w: 0.12, h: 0.065 },
    { op: "grayscale", x: 0, y: 0, w: 1, h: 0.125 },
  ],
  Interior_Auto: [
    { op: "fill", shape: "rect", x: 0.0, y: 0.125, w: 0.32, h: 0.09 },
    { op: "grayscale", x: 0, y: 0, w: 1, h: 0.125 },
  ],
};

/** Hidden underbody parts plus the badge lettering mesh. */
const REMOVED_NODES =
  /_(driveshaft|halfshafts|transfercase|diff|subframe|swaybar|lowerarm|upperarm|toelink|tierod|steering_rack|fueltank|heatshield|exhaust_[LR]|exh_muffler|transmission|engine_block_bottom|engine_block_generator|header_turbo|reinforcement|strut_F|shock_R|spring_R|hub_[FR]|radfan|lettering_m2)/;

async function solidPng(color) {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: color } }).png().toBuffer();
}

/** Pixel rectangle for a region, clamped to the image. */
function pixelRect(region, width, height) {
  const box =
    region.shape === "circle"
      ? { x: region.cx - region.r, y: region.cy - (region.r * width) / height, w: region.r * 2, h: (region.r * 2 * width) / height }
      : { x: region.x ?? 0, y: region.y ?? 0, w: region.w ?? 1, h: region.h ?? 1 };
  const left = Math.max(0, Math.round(box.x * width));
  const top = Math.max(0, Math.round(box.y * height));
  return {
    left,
    top,
    width: Math.min(width - left, Math.round(box.w * width)),
    height: Math.min(height - top, Math.round(box.h * height)),
  };
}

/** The most common colour in a 3px ring just outside a rectangle (the surface the logo sits on). */
async function surroundingColor(image, rect, width, height) {
  const pad = 3;
  const left = Math.max(0, rect.left - pad);
  const top = Math.max(0, rect.top - pad);
  const w = Math.min(width - left, rect.width + pad * 2);
  const h = Math.min(height - top, rect.height + pad * 2);
  const pixels = await sharp(image).extract({ left, top, width: w, height: h }).removeAlpha().raw().toBuffer();
  const bins = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= pad && x < w - pad && y >= pad && y < h - pad) continue;
      const i = (y * w + x) * 3;
      const key = `${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`;
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++;
      bin.r += pixels[i];
      bin.g += pixels[i + 1];
      bin.b += pixels[i + 2];
      bins.set(key, bin);
    }
  }
  const top1 = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  return `rgb(${Math.round(top1.r / top1.n)},${Math.round(top1.g / top1.n)},${Math.round(top1.b / top1.n)})`;
}

async function editImage(image, edits) {
  let current = image;
  for (const edit of edits) {
    const { width, height } = await sharp(current).metadata();
    if (edit.op === "solid") {
      current = await solidPng(edit.color);
    } else if (edit.op === "fill") {
      const rect = pixelRect(edit, width, height);
      const fill = await surroundingColor(current, rect, width, height);
      const shape =
        edit.shape === "circle"
          ? `<circle cx="${edit.cx * width}" cy="${edit.cy * height}" r="${edit.r * width}" fill="${fill}"/>`
          : `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="${fill}"/>`;
      const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shape}</svg>`);
      current = await sharp(current).composite([{ input: overlay }]).png().toBuffer();
    } else if (edit.op === "grayscale") {
      const rect = pixelRect(edit, width, height);
      const gray = await sharp(current).extract(rect).grayscale().toColourspace("srgb").png().toBuffer();
      current = await sharp(current).composite([{ input: gray, left: rect.left, top: rect.top }]).png().toBuffer();
    }
  }
  return current;
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
const editedTextures = new Set();
for (const [materialName, edits] of Object.entries(TEXTURE_EDITS)) {
  const material = root.listMaterials().find((m) => m.getName() === PREFIX + materialName);
  const baseColor = material?.getBaseColorTexture();
  if (!baseColor) throw new Error(`No base-colour texture for material ${materialName}`);
  if (editedTextures.has(baseColor)) continue;
  editedTextures.add(baseColor);
  baseColor.setImage(await editImage(baseColor.getImage(), edits)).setMimeType("image/png");
  // A flat replacement keeps no relief from the logo it replaced.
  if (edits.some((e) => e.op === "solid")) material.setNormalTexture(null);
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
