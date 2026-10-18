import { worlds, renderWorld, renderViewer, lookup, SHOT_DIR } from "./render.js";
import { startHero } from "./hero.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- render ---------------------------------------------------------------
$("#world-list").innerHTML = worlds.map(renderWorld).join("");
$("#year").textContent = new Date().getFullYear();

// ---- hero -----------------------------------------------------------------
// Storm scene in three.js; if three.js cannot load (offline, blocked), fall back to the small 2D shader.
const heroCanvas = $("#hero-canvas");
import("./hero3d.js")
  .then((m) => { window.__hero = m.startHero3D(heroCanvas, { reduced }); })
  .catch((err) => {
    console.warn("3D hero unavailable, using fallback", err);
    const c = heroCanvas.cloneNode();
    heroCanvas.replaceWith(c);
    startHero(c, { reduced });
  });

// ---- reveal on scroll (fade only) ----------------------------------------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
}, { threshold: 0.1 });
$$(".reveal").forEach((el) => io.observe(el));

// ---- nav state ------------------------------------------------------------
const nav = $("#nav");
const onScroll = () => nav.classList.toggle("solid", window.scrollY > 40);
onScroll();
addEventListener("scroll", onScroll, { passive: true });

// ---- viewer dialog --------------------------------------------------------
const dlg = $("#viewer"), body = $("#viewer-body");
let cur = null, ci = 0, opener = null;
function show(i) {
  ci = (i + cur.shots.length) % cur.shots.length;
  const s = cur.shots[ci];
  const img = $("#viewer-img");
  img.src = SHOT_DIR + s.src; img.alt = s.alt;
  $("#viewer-cap").textContent = s.caption;
  $$(".viewer-nav .thumb", body).forEach((t, j) => t.classList.toggle("on", j === ci));
}
function openViewer(slug, i = 0, from = null) {
  cur = lookup(slug); if (!cur) return;
  opener = from;
  body.innerHTML = renderViewer(cur, i);
  ci = i;
  if (!dlg.open) dlg.showModal();
  document.documentElement.classList.add("lock");
}
const closeViewer = () => { if (dlg.open) dlg.close(); };
dlg.addEventListener("close", () => { document.documentElement.classList.remove("lock"); opener?.focus?.(); });
$("#viewer-close").addEventListener("click", closeViewer);
dlg.addEventListener("click", (e) => { if (e.target === dlg) closeViewer(); });
body.addEventListener("click", (e) => {
  const step = e.target.closest("[data-step]"); if (step) return show(ci + +step.dataset.step);
  const t = e.target.closest("[data-vi]"); if (t) show(+t.dataset.vi);
});
dlg.addEventListener("keydown", (e) => {
  if (!cur || cur.shots.length < 2) return;
  if (e.key === "ArrowRight") show(ci + 1);
  if (e.key === "ArrowLeft") show(ci - 1);
});
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if (!o || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  openViewer(o.dataset.open, +o.dataset.i || 0, o);
});
