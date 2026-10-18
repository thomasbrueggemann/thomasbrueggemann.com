// Pure string renderers: data in, HTML out. No DOM access here.
import { scenes } from "./data.js";

export const SHOT_DIR = "assets/shots/";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmtDate = (d) => {
  const [y, m] = d.split("-");
  return m ? `${MONTHS[+m - 1]} ${y}` : y;
};

const arrow = `<span aria-hidden="true">↗</span>`;
const shotUrl = (s) => SHOT_DIR + s.src;

function actions(p) {
  return `<div class="actions">
    <a class="btn btn-solid" href="${esc(p.href)}">Enter the scene <span aria-hidden="true">→</span></a>
    <a class="btn" href="${esc(p.source)}" target="_blank" rel="noopener">Source ${arrow}</a>
  </div>`;
}

export function renderScene(p, i) {
  const first = p.shots[0];
  return `<article class="scene ${i % 2 ? "flip" : ""}" id="s-${p.slug}" data-slug="${p.slug}">
    <div class="wrap scene-grid">
      <div class="scene-visual reveal">
        <button class="frame-shot" type="button" data-open="${p.slug}" data-i="0" aria-label="Open screenshots of ${esc(p.title)}">
          <img src="${shotUrl(first)}" alt="${esc(first.alt)}" width="1600" height="1000" loading="lazy" decoding="async">
        </button>
      </div>
      <div class="scene-copy reveal">
        <p class="meta">${esc(p.meta)}</p>
        <h3>${esc(p.title)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        <p class="desc">${esc(p.description)}</p>
        ${actions(p)}
        <button class="more" type="button" data-open="${p.slug}" data-i="0">Details and ${p.shots.length} screenshots →</button>
      </div>
    </div>
  </article>`;
}

/** Content of the detail/gallery dialog. */
export function renderViewer(p, index = 0) {
  const s = p.shots[index];
  return `<div class="viewer-grid">
    <div class="viewer-media">
      <figure>
        <img id="viewer-img" src="${shotUrl(s)}" alt="${esc(s.alt)}">
        <figcaption id="viewer-cap">${esc(s.caption)}</figcaption>
      </figure>
      ${
        p.shots.length > 1
          ? `<div class="viewer-nav">
        <button type="button" data-step="-1" aria-label="Previous screenshot">←</button>
        <div class="thumbs">${p.shots
          .map((t, j) => `<button type="button" class="thumb ${j === index ? "on" : ""}" data-vi="${j}" aria-label="${esc(t.caption)}"><img src="${shotUrl(t)}" alt="" width="160" height="100"></button>`)
          .join("")}</div>
        <button type="button" data-step="1" aria-label="Next screenshot">→</button>
      </div>`
          : ""
      }
    </div>
    <div class="viewer-info">
      <p class="meta">${esc(p.meta)} · ${fmtDate(p.date)}</p>
      <h3>${esc(p.title)}</h3>
      <p class="tagline">${esc(p.tagline)}</p>
      <p class="desc">${esc(p.description)}</p>
      <ul class="hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
      <p class="stack">${p.tags.map(esc).join(" · ")}</p>
      ${actions(p)}
    </div>
  </div>`;
}

export const lookup = (slug) => scenes.find((p) => p.slug === slug);
export { scenes };
