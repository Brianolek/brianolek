/* Brian Olek — site behaviour: gallery, viewer, cursor, scroll. */
(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#year").textContent = new Date().getFullYear();

  /* ---------- data ---------- */
  let works = [];
  try { works = await (await fetch("works.json")).json(); } catch (e) { console.error("works.json failed", e); }
  const hero = works.find(w => w.hero) || works[0];

  /* ---------- hero ---------- */
  if (hero) {
    Smear($("#smear"), `img/full/${hero.id}.webp`, { strength: 0.55 });
    $("#heroCaption").textContent = `${hero.title} · ${hero.medium}`;
  }
  /* letters of the name smear up when the pointer is near them */
  const name = $("[data-smear]");
  const letters = [];
  name.innerHTML = "";
  for (const ch of "Brian Olek") {
    const s = document.createElement("span");
    if (ch === " ") { s.className = "sp"; s.innerHTML = "&nbsp;"; } else s.textContent = ch;
    name.appendChild(s); letters.push(s);
  }
  if (!reduced && matchMedia("(pointer: fine)").matches) {
    const heroEl = $(".hero");
    heroEl.addEventListener("pointermove", e => {
      for (const s of letters) {
        const r = s.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(e.clientX - cx, e.clientY - cy);
        const k = Math.max(0, 1 - d / 260);
        s.style.transform = k ? `translateY(${-k * 22}px) scaleY(${1 + k * 0.18})` : "";
        s.style.filter = k > 0.05 ? `blur(${k * 1.6}px)` : "";
        s.style.opacity = 1 - k * 0.25;
      }
    }, { passive: true });
    heroEl.addEventListener("pointerleave", () => { for (const s of letters) { s.style.transform = ""; s.style.filter = ""; s.style.opacity = ""; } });
  }

  /* ---------- gallery ---------- */
  const wrap = $("#works");
  const roman = i => ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI","XXII"][i] || String(i + 1);
  const seriesName = { figures: "Figures", overdrive: "Overdrive", other: "" };
  function titleHTML(w) {
    const m = w.title.match(/^(.*?)\s*\((.*)\)$/);
    return m ? `${m[1]} <em>(${m[2]})</em>` : w.title;
  }
  function detail(w) { return [w.medium, w.size, w.year].filter(Boolean).join(" · "); }
  works.forEach((w, i) => {
    const el = document.createElement("article");
    el.className = "piece" + (w.w / w.h > 1.25 ? " is-wide" : "");
    el.dataset.series = w.series; el.dataset.index = i;
    el.innerHTML = `
      <figure class="piece-fig">
        <button type="button" aria-label="Open ${w.title}">
          <div class="ratio" style="--ar:${w.w} / ${w.h}; background:${w.color}">
            <img class="blurred" src="img/thumb/${w.id}.webp" alt="" aria-hidden="true" loading="lazy">
            <img class="sharp" src="img/full/${w.id}.webp" alt="${w.title}, ${w.medium}" loading="lazy" decoding="async">
          </div>
        </button>
      </figure>
      <div class="piece-cap">
        <span class="idx">${String(i + 1).padStart(2, "0")}${seriesName[w.series] ? " · " + seriesName[w.series] : ""}</span>
        <span class="t">${titleHTML(w)}</span>
        <span>${detail(w)}</span>
        ${w.note ? `<span class="n">${w.note}</span>` : ""}
      </div>`;
    el.querySelector("button").addEventListener("click", () => openViewer(i));
    wrap.appendChild(el);
  });
  const pieces = $$(".piece");
  /* In flow view a wide painting spans both columns; keep its width honest to the viewport height */
  function sizeRatios() {
    for (const p of pieces) {
      const r = p.querySelector(".ratio"), w = works[p.dataset.index];
      if (wrap.classList.contains("flow")) {
        const maxH = innerHeight * 0.82;
        r.style.maxWidth = Math.round(maxH * w.w / w.h) + "px";
      } else r.style.maxWidth = "";
    }
  }
  sizeRatios(); addEventListener("resize", sizeRatios);

  /* reveal + counter */
  const cNow = $("#counterNow"), cAll = $("#counterAll");
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.isIntersecting) { e.target.classList.add("in"); }
      if (e.isIntersecting && e.intersectionRatio > 0.5) {
        const vis = pieces.filter(p => !p.classList.contains("is-hidden"));
        cNow.textContent = String(vis.indexOf(e.target) + 1).padStart(2, "0");
      }
    }
  }, { threshold: [0.15, 0.55], rootMargin: "0px 0px -8% 0px" });
  pieces.forEach(p => io.observe(p));

  /* filters */
  function applyFilter(series) {
    let n = 0;
    for (const p of pieces) {
      const on = series === "all" || p.dataset.series === series;
      p.classList.toggle("is-hidden", !on); if (on) n++;
    }
    cAll.textContent = String(n).padStart(2, "0");
    cNow.textContent = "01";
  }
  $$(".filters .chip").forEach(b => b.addEventListener("click", () => {
    $$(".filters .chip").forEach(x => x.classList.toggle("is-on", x === b));
    const run = () => applyFilter(b.dataset.series);
    document.startViewTransition && !reduced ? document.startViewTransition(run) : run();
  }));
  $$(".views .chip").forEach(b => b.addEventListener("click", () => {
    $$(".views .chip").forEach(x => x.classList.toggle("is-on", x === b));
    const run = () => {
      wrap.classList.toggle("flow", b.dataset.view === "flow");
      wrap.classList.toggle("grid", b.dataset.view === "grid");
      $(".work").classList.toggle("is-grid", b.dataset.view === "grid");
      sizeRatios();
      if (b.dataset.view === "grid") pieces.forEach(p => p.classList.add("in"));
    };
    document.startViewTransition && !reduced ? document.startViewTransition(run) : run();
    try { localStorage.setItem("bo-view", b.dataset.view); } catch (e) {}
  }));
  try { const v = localStorage.getItem("bo-view"); if (v === "grid") $('.views [data-view="grid"]').click(); } catch (e) {}

  /* ---------- viewer ---------- */
  const viewer = $("#viewer"), vImg = $("#viewerImg"), vCap = $("#viewerCap");
  let current = -1;
  function visibleIndices() { return pieces.filter(p => !p.classList.contains("is-hidden")).map(p => +p.dataset.index); }
  function show(i) {
    const w = works[i]; current = i;
    vImg.style.opacity = 0; vImg.style.filter = "url(#vblur)"; vImg.style.transform = "translateY(20px)";
    const next = new Image();
    next.onload = () => {
      vImg.src = next.src; vImg.alt = `${w.title}, ${w.medium}`;
      vCap.innerHTML = `<span class="t">${titleHTML(w)}</span>${detail(w)}`;
      requestAnimationFrame(() => { vImg.style.opacity = ""; vImg.style.filter = ""; vImg.style.transform = ""; });
    };
    next.src = `img/full/${w.id}.webp`;
  }
  function openViewer(i) {
    viewer.hidden = false; document.body.style.overflow = "hidden";
    requestAnimationFrame(() => viewer.classList.add("is-open"));
    show(i); $("#viewerClose").focus();
  }
  function closeViewer() {
    viewer.classList.remove("is-open"); document.body.style.overflow = "";
    setTimeout(() => { viewer.hidden = true; vImg.removeAttribute("src"); }, 350);
    const p = pieces[current]; p && p.querySelector("button").focus({ preventScroll: true });
  }
  function step(d) {
    const vis = visibleIndices(); if (!vis.length) return;
    const k = vis.indexOf(current); show(vis[(k + d + vis.length) % vis.length]);
  }
  $("#viewerClose").addEventListener("click", closeViewer);
  $("#viewerPrev").addEventListener("click", () => step(-1));
  $("#viewerNext").addEventListener("click", () => step(1));
  viewer.addEventListener("click", e => { if (e.target === viewer || e.target.classList.contains("viewer-fig")) closeViewer(); });
  addEventListener("keydown", e => {
    if (viewer.hidden) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });
  let tx = 0;
  viewer.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
  viewer.addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }, { passive: true });

  /* ---------- scroll: progress bar, nav highlight, hero parallax ---------- */
  const bar = $(".progress"), heroCopy = $(".hero-copy"), smear = $("#smear");
  const sections = ["work", "about", "contact"].map(id => document.getElementById(id));
  const navLinks = $$(".nav a");
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (y < innerHeight) {
        const k = y / innerHeight;
        heroCopy.style.transform = `translateY(${k * 80}px)`; heroCopy.style.opacity = 1 - k * 1.4;
        smear.style.transform = `scale(${1 + k * 0.08})`; smear.style.opacity = 1 - k * 0.6;
      }
      let here = -1;
      sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * 0.4) here = i; });
      navLinks.forEach((a, i) => a.classList.toggle("is-here", i === here));
      ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- cursor ---------- */
  if (matchMedia("(pointer: fine)").matches) {
    const c = $(".cursor"); let cx = 0, cy = 0, x = 0, y = 0;
    addEventListener("pointermove", e => { cx = e.clientX; cy = e.clientY; document.body.classList.add("has-cursor"); }, { passive: true });
    document.addEventListener("pointerleave", () => document.body.classList.remove("has-cursor"));
    (function tick() { x += (cx - x) * 0.35; y += (cy - y) * 0.35; c.style.transform = `translate(${x}px,${y}px)`; requestAnimationFrame(tick); })();
    const hot = "a, button, .piece-fig";
    addEventListener("pointerover", e => document.body.classList.toggle("cursor-hot", !!e.target.closest(hot)));
  }
})();
