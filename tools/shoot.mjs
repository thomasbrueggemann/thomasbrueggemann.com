#!/usr/bin/env node
// Capture a screenshot of a live page (WebGL games included) and write an
// optimised webp into assets/shots/. Uses your installed Google Chrome.
//
//   npm i --no-save puppeteer-core      (once; nothing is committed to package.json)
//   node tools/shoot.mjs <slug> <n> <url> [options]
//
//   <slug> <n>   output file is assets/shots/<slug>-<n>.webp   (n = 1, 2, 3 …)
//   --click "Text"   click the first button/link whose text matches (regex, case-insensitive)
//   --keys "KeyW:2500,ArrowRight:1000"   hold keys for N ms each, after the click
//   --wait 8000      ms to wait after load / click before the shot (default 6000)
//   --size 1440x900  viewport (default 1440x900)
//   --click-xy 700,450   a raw mouse click (e.g. "click to start" overlays)
//
// Example:
//   node tools/shoot.mjs lighthouse 1 https://thomasbrueggemann.github.io/lighthouse/ --click "take up the watch" --wait 9000
//
// Needs: ImageMagick (`magick`) for the webp conversion.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [slug, n, url, ...rest] = process.argv.slice(2);
if (!slug || !n || !url) {
  console.error("usage: node tools/shoot.mjs <slug> <n> <url> [--click text] [--keys Code:ms,…] [--wait ms] [--size WxH] [--click-xy x,y]");
  process.exit(1);
}
const opt = (k, d) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; };
const [W, H] = opt("size", "1440x900").split("x").map(Number);
const wait = +opt("wait", 6000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { default: puppeteer } = await import("puppeteer-core").catch(() => {
  console.error("Run `npm i --no-save puppeteer-core` first.");
  process.exit(1);
});

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  // GPU flags matter: without them WebGL games render black or crawl.
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
await page.goto(url, { waitUntil: "load", timeout: 60000 });
await sleep(Math.min(wait, 4000));

const click = opt("click");
if (click) {
  const hit = await page.evaluate((src) => {
    const re = new RegExp(src, "i");
    const el = [...document.querySelectorAll("button,a,[role=button],div,span")].find((e) => e.children.length < 3 && re.test((e.innerText || "").trim()) && (e.innerText || "").trim().length < 40);
    el?.click();
    return el ? el.innerText.trim() : null;
  }, click);
  console.log("clicked:", hit);
}
const xy = opt("click-xy");
if (xy) { const [x, y] = xy.split(",").map(Number); await page.mouse.click(x, y); }
await sleep(wait);

for (const spec of (opt("keys", "") || "").split(",").filter(Boolean)) {
  const [code, ms] = spec.split(":");
  await page.keyboard.down(code); await sleep(+ms || 1000); await page.keyboard.up(code);
}

const tmp = path.join(tmpdir(), `shoot-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const png = path.join(tmp, "shot.png");
await page.screenshot({ path: png });
await browser.close();

const out = path.resolve(import.meta.dirname, "..", "assets", "shots", `${slug}-${n}.webp`);
execFileSync("magick", [png, "-resize", "1600x>", "-strip", "-quality", "80", "-define", "webp:method=6", out]);
rmSync(tmp, { recursive: true, force: true });
console.log("wrote", path.relative(process.cwd(), out));
