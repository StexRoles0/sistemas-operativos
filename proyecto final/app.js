// ── Constants ──────────────────────────────────────────────────────────────
const LOGICAL_BITS  = 32;
const TOTAL_RAM     = 2 ** 32;   // 4 GiB
const STORAGE_KEY   = "segpag-v3-catalog";
const COLORS = [
  "#7dd3fc", "#fbbf24", "#34d399", "#f87171",
  "#a78bfa", "#fb923c", "#e879f9", "#4ade80",
  "#facc15", "#38bdf8", "#818cf8", "#f472b6",
];
const DEFAULT_CATALOG = [
  { key: 1, name: "NotePad",     txt: 195240,  data: 12352,  bss: 1165,  heap: 131072,  stack: 65536  },
  { key: 2, name: "Word",        txt: 775390,  data: 32680,  bss: 4100,  heap: 262144,  stack: 65536  },
  { key: 3, name: "Excel",       txt: 995420,  data: 24245,  bss: 7557,  heap: 524288,  stack: 65536  },
  { key: 4, name: "AutoCad",     txt: 1150000, data: 123470, bss: 1123,  heap: 1048576, stack: 131072 },
  { key: 5, name: "Calculadora", txt: 123420,  data: 1246,   bss: 1756,  heap: 131072,  stack: 32768  },
];

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_VISUAL_CELLS = 256;   // max colored cells per segment row
const MAX_PT_ENTRIES   = 200;   // max entries shown in the page table popup

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  pageSize:   4096,
  catalog:    [],
  loaded:     [],     // { loadId, name, color, segments:[{index,name,size,baseFrame,pageCount}], totalPages }
  // No frameMap — ownership is derived from state.loaded directly.
  // This avoids allocating millions of objects for large programs.
  nextFrame:  0,
  nextLoadId: 1,
  colorIndex: 0,
};

// ── Utilities ──────────────────────────────────────────────────────────────
function fmt(v) {
  v = Number(v);
  if (v >= 1_048_576) return `${(v / 1_048_576).toFixed(2)} MiB`;
  if (v >= 1_024)     return `${(v / 1_024).toFixed(2)} KiB`;
  return `${v} B`;
}

function hex(v, w = 8) {
  return `0x${v.toString(16).toUpperCase().padStart(w, "0")}`;
}

function bin(v, bits) {
  return v.toString(2).padStart(bits, "0");
}

function totalFrames()  { return Math.floor(TOTAL_RAM / state.pageSize); }
function offBits()      { return Math.round(Math.log2(state.pageSize)); }
function segBitsCount() { return 3; }
function pgBits()       { return LOGICAL_BITS - segBitsCount() - offBits(); }
function progSize(p)    { return (+p.txt) + (+p.data) + (+p.bss) + (+p.heap) + (+p.stack); }
function pageCnt(size)  { return Math.ceil(size / state.pageSize); }

// ── Storage ────────────────────────────────────────────────────────────────
function saveCatalog() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.catalog)); } catch (_) {}
}

function initCatalog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length) { state.catalog = p; return; }
    }
  } catch (_) {}
  state.catalog = structuredClone(DEFAULT_CATALOG);
}

async function tryLoadFromJson() {
  try {
    const r = await fetch("./programas.json");
    if (!r.ok) return;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) return;
    state.catalog = data.map((p, i) => ({
      key:   Number(p.key)  || i + 1,
      name:  String(p.name) || `Proceso ${i + 1}`,
      txt:   Math.max(1, Number(p.txt)   || 1),
      data:  Math.max(0, Number(p.data)  || 0),
      bss:   Math.max(0, Number(p.bss)   || 0),
      heap:  Math.max(1, Number(p.heap)  || 131072),
      stack: Math.max(1, Number(p.stack) || 65536),
    }));
    saveCatalog();
  } catch (_) {}
}

// ── Frame Allocator ────────────────────────────────────────────────────────
// Ownership is stored inside each seg object (baseFrame + pageCount),
// so no per-frame array is needed — no memory blowup for large programs.

function allocFrames(count) {
  const base = state.nextFrame;
  state.nextFrame += count;
  return base;
}

function loadProgram(entry) {
  const tf = totalFrames();
  const segs = [
    { name: "Código", size: Math.max(1, +entry.txt)        },
    { name: "Datos",  size: Math.max(1, +entry.data || 1)  },
    { name: "BSS",    size: Math.max(1, +entry.bss  || 1)  },
    { name: "Heap",   size: Math.max(1, +entry.heap)       },
    { name: "Stack",  size: Math.max(1, +entry.stack)      },
  ];
  const needed = segs.reduce((s, g) => s + pageCnt(g.size), 0);
  if (state.nextFrame + needed > tf) return null;

  const color  = COLORS[state.colorIndex % COLORS.length];
  state.colorIndex++;
  const loadId = state.nextLoadId++;

  const loadedSegs = segs.map((seg, i) => {
    const pc        = pageCnt(seg.size);
    const baseFrame = allocFrames(pc);
    return { index: i, name: seg.name, size: seg.size, baseFrame, pageCount: pc };
  });

  const prog = { loadId, name: entry.name, color, segments: loadedSegs, totalPages: needed };
  state.loaded.push(prog);
  return prog;
}

function unloadProgram(loadId) {
  state.loaded = state.loaded.filter(p => p.loadId !== loadId);
  // Recalculate nextFrame as the highest frame still in use.
  // This reclaims any trailing free space left by the removed program.
  state.nextFrame = state.loaded.reduce((max, prog) =>
    prog.segments.reduce((m, s) => Math.max(m, s.baseFrame + s.pageCount), max)
  , 0);
}

function clearRAM() {
  state.nextFrame  = 0;
  state.loaded     = [];
  state.colorIndex = 0;
}

// ── Render: Hero Stats ─────────────────────────────────────────────────────
function renderHeroStats() {
  const el = document.getElementById("heroStats");
  if (!el) return;
  const tf  = totalFrames();
  const uf  = state.loaded.reduce((s, p) => s + p.totalPages, 0);
  const ub  = uf * state.pageSize;
  const pct = ((uf / tf) * 100).toFixed(4);

  el.innerHTML = `
    <div class="stat-card">
      <span>Espacio lógico</span>
      <strong>2<sup>32</sup> bytes</strong>
      <small>4 GiB por proceso</small>
    </div>
    <div class="stat-card">
      <span>Marcos totales</span>
      <strong>${tf.toLocaleString("es")}</strong>
      <small>de ${fmt(state.pageSize)} c/u</small>
    </div>
    <div class="stat-card ${uf > 0 ? "stat-card--on" : ""}">
      <span>RAM usada</span>
      <strong>${fmt(ub)}</strong>
      <small>${pct}% · ${uf.toLocaleString("es")} marcos</small>
    </div>
    <div class="stat-card ${state.loaded.length > 0 ? "stat-card--on" : ""}">
      <span>Procesos en RAM</span>
      <strong>${state.loaded.length}</strong>
      <small>${state.loaded.length === 1 ? "proceso activo" : "procesos activos"}</small>
    </div>
  `;
}

// ── Render: Bit Breakdown ──────────────────────────────────────────────────
function renderBitBreakdown() {
  const el = document.getElementById("bitBreakdown");
  if (!el) return;
  const sb = segBitsCount(), pb = pgBits(), ob = offBits();
  el.innerHTML = `
    <div class="bb-row">
      <span class="bb-chip bb--seg">${sb} bits · segmento</span>
      <span class="bb-chip bb--page">${pb} bits · página</span>
      <span class="bb-chip bb--off">${ob} bits · offset</span>
    </div>
    <code class="bb-code">[${sb}][${pb}][${ob}] = ${LOGICAL_BITS} bits</code>
  `;
}

// ── Render: Catalog ────────────────────────────────────────────────────────
function renderCatalog() {
  const el = document.getElementById("catalog");
  if (!el) return;
  if (!state.catalog.length) {
    el.innerHTML = '<p class="empty">Catálogo vacío.</p>';
    return;
  }
  el.innerHTML = state.catalog.map(p => `
    <div class="cat-card">
      <div class="cat-head">
        <strong>${p.name}</strong>
        <span class="cat-size">${fmt(progSize(p))}</span>
      </div>
      <div class="cat-segs">
        <span>.txt ${fmt(p.txt)}</span>
        <span>.data ${fmt(p.data)}</span>
        <span>.bss ${fmt(p.bss)}</span>
        <span>heap ${fmt(p.heap)}</span>
        <span>stack ${fmt(p.stack)}</span>
      </div>
      <div class="cat-row-btns">
        <button class="primary small" data-load-key="${p.key}">Cargar en RAM</button>
        <button class="ghost small" data-del-key="${p.key}">Eliminar</button>
      </div>
    </div>
  `).join("");
}

// ── Render: RAM Overview Bar ───────────────────────────────────────────────
function renderRAMOverview() {
  const bar   = document.getElementById("ramOverviewBar");
  const label = document.getElementById("ramOverviewLabel");
  if (!bar) return;

  const tf = totalFrames();
  const uf = state.loaded.reduce((s, p) => s + p.totalPages, 0);

  if (!uf) {
    bar.innerHTML   = "";
    if (label) label.textContent = "RAM vacía — 0 marcos usados de " + tf.toLocaleString("es");
    return;
  }

  // Bar: proportional to the used region (not full 4GB, which would be invisible)
  const segs = [];
  for (const prog of state.loaded) {
    for (const seg of prog.segments) {
      const w = ((seg.pageCount / uf) * 100).toFixed(4);
      segs.push(`<div class="ram-ov-seg" style="width:${w}%;background:${prog.color}" title="${prog.name} · ${seg.name}: ${seg.pageCount} marcos"></div>`);
    }
  }
  bar.innerHTML = segs.join("");

  if (label) {
    const ub  = uf * state.pageSize;
    const pct = ((uf / tf) * 100).toFixed(6);
    label.innerHTML = `<strong>${fmt(ub)}</strong> usados de 4 GiB &nbsp;·&nbsp; ${pct}% &nbsp;·&nbsp; ${uf.toLocaleString("es")} / ${tf.toLocaleString("es")} marcos`;
  }
}

// ── Render: Frame Map ──────────────────────────────────────────────────────
function renderFrameMap() {
  const el      = document.getElementById("frameMap");
  const emptyEl = document.getElementById("ramEmpty");
  if (!el) return;

  if (!state.loaded.length) {
    el.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  const rows = [];
  for (const prog of state.loaded) {
    for (const seg of prog.segments) {
      const { pageCount } = seg;

      // Cap visual cells — group multiple pages per cell when segment is large
      const cellCount    = Math.min(pageCount, MAX_VISUAL_CELLS);
      const pagesPerCell = Math.ceil(pageCount / cellCount);

      const cells = Array.from({ length: cellCount }, (_, i) => {
        const p0   = i * pagesPerCell;
        const p1   = Math.min(p0 + pagesPerCell - 1, pageCount - 1);
        const f0   = seg.baseFrame + p0;
        const f1   = seg.baseFrame + p1;
        const tip  = pagesPerCell === 1
          ? `P${p0} → M${f0}\n${hex(f0 * state.pageSize)}`
          : `P${p0}–P${p1} → M${f0}–M${f1}\n${hex(f0 * state.pageSize)} – ${hex(f1 * state.pageSize)}`;
        return `<div class="fc" style="background:${prog.color}" title="${tip}"></div>`;
      }).join("");

      const scaleNote = pagesPerCell > 1
        ? `<span class="fm-scale">1 celda = ${pagesPerCell} páginas</span>`
        : "";

      rows.push(`
        <div class="fm-row">
          <div class="fm-label">
            <span class="fm-dot" style="background:${prog.color}"></span>
            <span class="fm-prog">${prog.name}</span>
            <span class="fm-seg">${seg.name}</span>
            <span class="fm-info">${seg.pageCount} pág · ${fmt(seg.size)}</span>
            ${scaleNote}
          </div>
          <div class="fm-cells">${cells}</div>
        </div>
      `);
    }
  }
  el.innerHTML = rows.join("");
}

// ── Render: RAM Legend ─────────────────────────────────────────────────────
function renderRAMLegend() {
  const el = document.getElementById("ramLegend");
  if (!el) return;
  if (!state.loaded.length) { el.innerHTML = ""; return; }
  el.innerHTML = state.loaded.map(p => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${p.color}"></span>
      <span>${p.name}</span>
      <span class="legend-info">${p.totalPages} marcos · ${fmt(p.totalPages * state.pageSize)}</span>
    </div>
  `).join("");
}

// ── Render: Loaded Programs (Segment + Page Tables) ────────────────────────
function renderLoadedPrograms() {
  const el = document.getElementById("loadedPrograms");
  if (!el) return;
  if (!state.loaded.length) {
    el.innerHTML = '<p class="empty">No hay procesos en RAM.</p>';
    return;
  }

  el.innerHTML = state.loaded.map(prog => {
    const segRows = prog.segments.map(seg => {
      const limitFrame = seg.baseFrame + seg.pageCount - 1;
      const physBase   = hex(seg.baseFrame * state.pageSize);
      const physLimit  = hex(limitFrame * state.pageSize + state.pageSize - 1);

      // Page table — capped to avoid DOM explosion on large segments
      const showPT  = Math.min(seg.pageCount, MAX_PT_ENTRIES);
      const hiddenPT = seg.pageCount - showPT;
      const ptCells = Array.from({ length: showPT }, (_, i) => {
        const frame = seg.baseFrame + i;
        return `<span class="pt-cell" title="P${i} → M${frame} · ${hex(frame * state.pageSize)}">P${i}→M${frame}</span>`;
      }).join("") + (hiddenPT > 0
        ? `<span class="pt-cell pt-cell--more">+${hiddenPT} entradas más…</span>`
        : "");

      return `
        <tr>
          <td class="mono">${seg.index}</td>
          <td><span class="seg-badge" style="border-color:${prog.color}40;color:${prog.color}">${seg.name}</span></td>
          <td>${fmt(seg.size)}</td>
          <td class="mono">${seg.pageCount}</td>
          <td class="mono">${physBase}</td>
          <td class="mono">${physLimit}</td>
          <td>
            <button class="ghost tiny" data-toggle-pt="${prog.loadId}-${seg.index}">▼ páginas</button>
          </td>
        </tr>
        <tr class="pt-row" id="pt-${prog.loadId}-${seg.index}" hidden>
          <td colspan="7">
            <div class="pt-grid">${ptCells}</div>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="loaded-card">
        <div class="loaded-head">
          <div class="loaded-title">
            <span class="loaded-dot" style="background:${prog.color}"></span>
            <strong>${prog.name}</strong>
            <span class="loaded-meta">${prog.totalPages} marcos · ${fmt(prog.totalPages * state.pageSize)}</span>
          </div>
          <button class="danger-ghost small" data-unload="${prog.loadId}">Descargar</button>
        </div>
        <div class="table-wrap">
          <table class="seg-table">
            <thead>
              <tr>
                <th>Seg#</th><th>Nombre</th><th>Tamaño</th>
                <th>Páginas</th><th>Base física</th><th>Límite físico</th><th></th>
              </tr>
            </thead>
            <tbody>${segRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");
}

// ── Render: Translation Selects ────────────────────────────────────────────
function renderTranslationSelects() {
  const progSel = document.getElementById("transProgram");
  const segSel  = document.getElementById("transSegment");
  if (!progSel || !segSel) return;

  if (!state.loaded.length) {
    progSel.innerHTML = '<option value="">— carga un proceso primero —</option>';
    segSel.innerHTML  = '<option value="">—</option>';
    return;
  }

  progSel.innerHTML = state.loaded.map(p =>
    `<option value="${p.loadId}">${p.name}</option>`
  ).join("");

  const prog = state.loaded.find(p => p.loadId === Number(progSel.value)) || state.loaded[0];
  if (prog) {
    segSel.innerHTML = prog.segments.map(s =>
      `<option value="${s.index}">${s.index} — ${s.name} (${fmt(s.size)})</option>`
    ).join("");
    const off = document.getElementById("transOffset");
    if (off) off.max = String(prog.segments[0]?.size - 1 ?? 0);
  }
}

// ── Render: Translation Result ─────────────────────────────────────────────
function renderTranslationResult() {
  const el      = document.getElementById("transResult");
  const progId  = Number(document.getElementById("transProgram")?.value);
  const segIdx  = Number(document.getElementById("transSegment")?.value);
  const offset  = Number(document.getElementById("transOffset")?.value ?? 0);
  if (!el) return;

  const prog = state.loaded.find(p => p.loadId === progId);
  if (!prog) { el.innerHTML = '<p class="empty">Selecciona un proceso cargado.</p>'; return; }

  const seg = prog.segments[segIdx];
  if (!seg) { el.innerHTML = '<p class="empty">Selecciona un segmento válido.</p>'; return; }

  if (offset < 0 || offset >= seg.size) {
    el.innerHTML = `<div class="trans-error">El offset <strong>${offset}</strong> está fuera del rango del segmento <strong>${seg.name}</strong> (0 – ${seg.size - 1}).</div>`;
    return;
  }

  const ob      = offBits();
  const pb      = pgBits();
  const sb      = segBitsCount();
  const pageNum = Math.floor(offset / state.pageSize);
  const pageOff = offset % state.pageSize;
  const frameNum = seg.baseFrame + pageNum;
  const physAddr = frameNum * state.pageSize + pageOff;
  const logAddr  = (segIdx << (pb + ob)) | (pageNum << ob) | pageOff;

  const sBin = bin(segIdx,  sb);
  const pBin = bin(pageNum, pb);
  const oBin = bin(pageOff, ob);

  el.innerHTML = `
    <div class="trans-cards">
      <div class="trans-card trans-card--logic">
        <span>Dirección lógica</span>
        <strong>${hex(logAddr)}</strong>
        <small class="mono">${bin(logAddr, LOGICAL_BITS)}</small>
      </div>
      <div class="trans-card">
        <span>Segmento</span>
        <strong>${seg.name} (S${segIdx})</strong>
        <small>${fmt(seg.size)} · ${seg.pageCount} páginas</small>
      </div>
      <div class="trans-card">
        <span>Página → Marco</span>
        <strong>P${pageNum} → M${frameNum}</strong>
        <small>Offset dentro de la página: ${pageOff} bytes</small>
      </div>
      <div class="trans-card trans-card--phys">
        <span>Dirección física</span>
        <strong>${hex(physAddr)}</strong>
        <small>M${frameNum} × ${fmt(state.pageSize)} + ${pageOff}</small>
      </div>
    </div>

    <div class="bit-diagram">
      <div class="bd-title">Descomposición de la dirección lógica · ${LOGICAL_BITS} bits</div>
      <div class="bd-bar">
        <div class="bd-field bd--seg"  style="flex:${sb}"><span class="bd-name">Segmento</span><span class="bd-count">${sb} bits</span></div>
        <div class="bd-field bd--page" style="flex:${pb}"><span class="bd-name">Página</span><span class="bd-count">${pb} bits</span></div>
        <div class="bd-field bd--off"  style="flex:${ob}"><span class="bd-name">Offset</span><span class="bd-count">${ob} bits</span></div>
      </div>
      <div class="bd-cells">
        ${sBin.split("").map(b => `<span class="bdc bdc--seg">${b}</span>`).join("")}
        ${pBin.split("").map(b => `<span class="bdc bdc--page">${b}</span>`).join("")}
        ${oBin.split("").map(b => `<span class="bdc bdc--off">${b}</span>`).join("")}
      </div>
      <div class="bd-bar bd-vals">
        <div class="bd-val bv--seg"  style="flex:${sb}"><code>${sBin}</code><span>${seg.name} (S${segIdx})</span></div>
        <div class="bd-val bv--page" style="flex:${pb}"><code>${pBin}</code><span>P${pageNum} → M${frameNum}</span></div>
        <div class="bd-val bv--off"  style="flex:${ob}"><code>${oBin}</code><span>+${pageOff} B</span></div>
      </div>
      <div class="bd-formula">
        <span class="bdf-label">Dir. física</span>
        <span>=</span>
        <span class="bdf-term bdf--page">M${frameNum} × ${fmt(state.pageSize)}</span>
        <span>+</span>
        <span class="bdf-term bdf--off">offset ${pageOff}</span>
        <span>=</span>
        <span class="bdf-term bdf--result">${hex(physAddr)}</span>
      </div>
    </div>
  `;
}

// ── Render: Explanation ────────────────────────────────────────────────────
function renderExplanation() {
  const el = document.getElementById("explanationText");
  if (!el) return;
  const sb = segBitsCount(), pb = pgBits(), ob = offBits();
  const tf = totalFrames();

  el.innerHTML = `
    <p>
      En la <strong>segmentación paginada</strong>, cada proceso tiene su propio espacio de
      direcciones lógicas de ${LOGICAL_BITS} bits dividido en tres campos:
    </p>
    <div class="exp-formula">
      [ ${sb} bits · segmento ] + [ ${pb} bits · página ] + [ ${ob} bits · desplazamiento ] = ${LOGICAL_BITS} bits
    </div>
    <ul>
      <li><strong>${sb} bits de segmento</strong>: identifican uno de ${2 ** sb} segmentos
          (Código, Datos, BSS, Heap, Stack). Cada segmento tiene su propia tabla de páginas.</li>
      <li><strong>${pb} bits de número de página</strong>: indican cuál de las hasta
          ${(2 ** pb).toLocaleString("es")} páginas del segmento se accede.</li>
      <li><strong>${ob} bits de desplazamiento</strong>: byte exacto dentro de la página de ${fmt(state.pageSize)}.</li>
    </ul>
    <p>
      La <strong>RAM física</strong> de 2<sup>32</sup> bytes se divide en
      <strong>${tf.toLocaleString("es")} marcos</strong> de ${fmt(state.pageSize)}.
      Cuando se carga un proceso, el sistema operativo asigna marcos contiguos a cada segmento.
      La <em>tabla de segmentos</em> guarda el marco base de cada segmento, y la <em>tabla de páginas</em>
      de ese segmento mapea cada página lógica a un marco físico.
    </p>
    <p>
      Traducción completa:
      <strong>dirección lógica → (segmento + página + offset) → marco físico → dirección física</strong>.
    </p>
  `;
}

// ── Render: All ────────────────────────────────────────────────────────────
function renderAll() {
  renderHeroStats();
  renderBitBreakdown();
  renderCatalog();
  renderRAMOverview();
  renderFrameMap();
  renderRAMLegend();
  renderLoadedPrograms();
  renderTranslationSelects();
  renderExplanation();
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.className  = `toast toast--${type}`;
  el.textContent = msg;
  el.hidden     = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3200);
}

// ── Events ─────────────────────────────────────────────────────────────────
function setupEvents() {

  // Load program from catalog
  document.getElementById("catalog")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-load-key]");
    if (btn) {
      const key   = Number(btn.dataset.loadKey);
      const entry = state.catalog.find(p => p.key === key);
      if (!entry) return;
      const result = loadProgram(entry);
      if (!result) {
        toast("RAM insuficiente para cargar este proceso.", "error");
      } else {
        toast(`"${entry.name}" cargado en RAM.`, "ok");
      }
      renderAll();
      return;
    }

    // Delete from catalog
    const del = e.target.closest("[data-del-key]");
    if (del) {
      const key = Number(del.dataset.delKey);
      state.catalog = state.catalog.filter(p => p.key !== key);
      saveCatalog();
      renderAll();
    }
  });

  // Unload program from RAM
  document.getElementById("loadedPrograms")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-unload]");
    if (!btn) return;
    const loadId = Number(btn.dataset.unload);
    const prog   = state.loaded.find(p => p.loadId === loadId);
    unloadProgram(loadId);
    if (prog) toast(`"${prog.name}" descargado de RAM.`, "ok");
    renderAll();
  });

  // Toggle page table row
  document.getElementById("loadedPrograms")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-toggle-pt]");
    if (!btn) return;
    const row = document.getElementById(`pt-${btn.dataset.togglePt}`);
    if (row) {
      row.hidden = !row.hidden;
      btn.textContent = row.hidden ? "▼ páginas" : "▲ páginas";
    }
  });

  // Clear RAM
  document.getElementById("clearRamBtn")?.addEventListener("click", () => {
    clearRAM();
    toast("RAM limpiada.", "ok");
    renderAll();
  });

  // Export JSON
  document.getElementById("exportBtn")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.catalog, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "programas.json"; a.click();
    URL.revokeObjectURL(url);
    toast("JSON descargado.", "ok");
  });

  // Add to catalog
  document.getElementById("addForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const fd  = new FormData(e.target);
    const maxKey = state.catalog.reduce((m, p) => Math.max(m, p.key), 0);
    const entry = {
      key:   maxKey + 1,
      name:  String(fd.get("name") || "Proceso"),
      txt:   Math.max(1, Number(fd.get("txt"))),
      data:  Math.max(0, Number(fd.get("data"))),
      bss:   Math.max(0, Number(fd.get("bss"))),
      heap:  Math.max(1, Number(fd.get("heap"))),
      stack: Math.max(1, Number(fd.get("stack"))),
    };
    state.catalog.push(entry);
    saveCatalog();
    e.target.reset();
    toast(`"${entry.name}" agregado al catálogo.`, "ok");
    renderCatalog();
  });

  // Page size change
  document.getElementById("pageSize")?.addEventListener("change", e => {
    if (state.loaded.length) {
      toast("No se puede cambiar el tamaño de página con procesos cargados.", "error");
      e.target.value = String(state.pageSize);
      return;
    }
    state.pageSize = Number(e.target.value);
    renderAll();
  });

  // Translation: update segment list when program changes
  document.getElementById("transProgram")?.addEventListener("change", () => {
    const progId = Number(document.getElementById("transProgram").value);
    const prog   = state.loaded.find(p => p.loadId === progId);
    const segSel = document.getElementById("transSegment");
    if (prog && segSel) {
      segSel.innerHTML = prog.segments.map(s =>
        `<option value="${s.index}">${s.index} — ${s.name} (${fmt(s.size)})</option>`
      ).join("");
    }
  });

  // Translation: update max offset when segment changes
  document.getElementById("transSegment")?.addEventListener("change", () => {
    const progId = Number(document.getElementById("transProgram").value);
    const segIdx = Number(document.getElementById("transSegment").value);
    const prog   = state.loaded.find(p => p.loadId === progId);
    const seg    = prog?.segments[segIdx];
    const off    = document.getElementById("transOffset");
    if (seg && off) {
      off.max = String(seg.size - 1);
      if (Number(off.value) >= seg.size) off.value = "0";
    }
  });

  document.getElementById("transBtn")?.addEventListener("click", renderTranslationResult);
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  initCatalog();
  // Try to enrich catalog from JSON if localStorage was empty
  const hadStored = Boolean(localStorage.getItem(STORAGE_KEY));
  if (!hadStored) await tryLoadFromJson();
  setupEvents();
  renderAll();
}

init();
