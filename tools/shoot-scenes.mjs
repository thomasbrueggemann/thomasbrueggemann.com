#!/usr/bin/env node
// Re-shoot the screenshots of the two scenes into assets/shots/ (webp, 1600 px wide).
//
//   npm i --no-save puppeteer-core          (once; nothing is committed to package.json)
//   python3 -m http.server 8090 &           (the page must be served over HTTP)
//   CHROME=/path/to/chrome node tools/shoot-scenes.mjs [storm|shade] [base-url]
//
// The pages are loaded with prefers-reduced-motion, which makes each scene render one still frame
// and wait; the shots below then step the scene by hand (frame(dt)) and park the camera. That makes
// every frame repeatable. Needs ImageMagick (`magick` or `convert`) for the webp conversion.
// Software GL (SwiftShader) works but is slow: allow a few minutes per shade shot.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const only = process.argv[2] && !process.argv[2].startsWith("http") ? process.argv[2] : null;
const base = (process.argv.find((a) => a.startsWith("http")) || "http://localhost:8090").replace(/\/$/, "");

// Park the storm camera (tower at the origin). The scene resets the camera every frame, so stop it from doing so.
const stormCam = (pos, at) => `(()=>{const c=__hero.camera,P=Object.getPrototypeOf(c),V=Object.getPrototypeOf(c.position);
  V.set.call(c.position,${pos});P.lookAt.call(c,${at});c.position.set=()=>c.position;c.lookAt=()=>{};__hero.frame(1.5);__hero.frame(0.016);})()`;

const SHOTS = {
  storm: {
    url: "/storm/",
    list: [
      ["storm-1", "__hero.frame(0.016);__hero.frame(0.016)"],                              // the default view
      ["storm-2", "Math.random=()=>0.3;__hero.strike();__hero.frame(0.29)"],               // a big bolt, mid-flash
      ["storm-3", stormCam("-14,10,62", "0,24,0")],                                         // low, in the spray
    ],
  },
  shade: {
    url: "/shade/",
    list: [
      ["shade-1", "__shade.frame(0.016);__shade.frame(0.016)"],                            // the avenue, sun at the far end
      ["shade-2", "__shade.setDrop(1);__shade.frame(0.016);__shade.frame(0.016)"],         // street level over the river
      ["shade-3", "__shade.setDrop(0);__shade.setYaw(40);__shade.frame(0.016);__shade.frame(0.016)"],   // turned 40°: trunk, towers, highway
    ],
  },
};

const { default: puppeteer } = await import("puppeteer-core").catch(() => {
  console.error("Run `npm i --no-save puppeteer-core` first.");
  process.exit(1);
});
const magick = (() => {
  for (const bin of ["magick", "convert"]) { try { execFileSync(bin, ["-version"], { stdio: "ignore" }); return bin; } catch {} }
  throw new Error("ImageMagick not found");
})();
const outDir = path.resolve(import.meta.dirname, "..", "assets", "shots");
const tmp = mkdtempSync(path.join(tmpdir(), "shoot-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
for (const [name, { url, list }] of Object.entries(SHOTS)) {
  if (only && only !== name) continue;
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.warn("page error:", e.message));
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto(base + url, { waitUntil: "load", timeout: 120000 });
  await sleep(5000);
  for (const [file, expr] of list) {
    await page.evaluate(expr);
    await sleep(1200);
    const png = path.join(tmp, file + ".png");
    await page.screenshot({ path: png });
    const out = path.join(outDir, file + ".webp");
    execFileSync(magick, [png, "-resize", "1600x>", "-strip", "-quality", "80", "-define", "webp:method=6", out]);
    console.log("wrote", path.relative(process.cwd(), out));
  }
  await page.close();
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
