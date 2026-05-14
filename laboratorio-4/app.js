const MB = 1024 * 1024;
const TOTAL_MEMORY_BYTES = 16 * MB;
const MAX_ADDRESS = TOTAL_MEMORY_BYTES - 1;
const OS_RESERVED_BYTES = 1 * MB;
const USER_MEMORY_BYTES = TOTAL_MEMORY_BYTES - OS_RESERVED_BYTES;
const USER_MEMORY_START = OS_RESERVED_BYTES;

const PAGE_SIZE = 4 * 1024;
const TOTAL_FRAMES = Math.floor(USER_MEMORY_BYTES / PAGE_SIZE); 

const DEFAULT_PROGRAMS = [
  { key: 1, id: 0, name: "NotePad",     txt: 195240,  data: 12352,   bss: 1165  },
  { key: 2, id: 0, name: "Word",        txt: 775390,  data: 32680,   bss: 4100  },
  { key: 3, id: 0, name: "Excel",       txt: 995420,  data: 24245,   bss: 7557  },
  { key: 4, id: 0, name: "AutoCad",     txt: 1150000, data: 123470,  bss: 1123  },
  { key: 5, id: 0, name: "Calculadora", txt: 123420,  data: 1246,    bss: 1756  },
  { key: 6, id: 0, name: "ProgramaErr", txt: 5250000, data: 3224000, bss: 51000 },
];

const optionsMemory = [
  { key: 1, name: "Estático tamaño fijo",   hasMenu: false, route: "/static",                    implemented: true },
  {
    key: 2, name: "Estático tamaño variable", hasMenu: true,
    subOptions: [
      { key: 21, name: "Primer Ajuste", route: "/variable/primer-ajuste",  implemented: true },
      { key: 22, name: "Peor Ajuste",   route: "/variable/peor-ajuste",    implemented: true },
      { key: 23, name: "Mejor Ajuste",  route: "/variable/mejor-ajuste",   implemented: true },
    ],
  },
  {
    key: 3, name: "Dinámico Sin Compactación", hasMenu: true,
    subOptions: [
      { key: 31, name: "Primer Ajuste", route: "/dinamico-sin-compactacion/primer-ajuste", implemented: true },
      { key: 32, name: "Peor Ajuste",   route: "/dinamico-sin-compactacion/peor-ajuste",   implemented: true },
      { key: 33, name: "Mejor Ajuste",  route: "/dinamico-sin-compactacion/mejor-ajuste",  implemented: true },
    ],
  },
  { key: 4, name: "Dinámico Con Compactación", hasMenu: false, route: "/dinamico-con-compactacion", implemented: true },
  
  {
    key: 5, name: "Segmentación", hasMenu: true,
    subOptions: [
      { key: 51, name: "Primer Ajuste", route: "/segmentacion/primer-ajuste", implemented: true },
      { key: 52, name: "Mejor Ajuste",  route: "/segmentacion/mejor-ajuste",  implemented: true },
      { key: 53, name: "Peor Ajuste",   route: "/segmentacion/peor-ajuste",   implemented: true },
    ],
  },
  { key: 6, name: "Paginación", hasMenu: false, route: "/paginacion", implemented: true },
];

const state = {
  programs: [],
  selectedPrograms: [],
  process: [],
  memoryState: [OS_RESERVED_BYTES, USER_MEMORY_BYTES],
  segmentBits: 0,
  offset: 0,
  isSidebarOpen: false,
  isFormOpen: true,
  currentRoute: "/form",
  selectedOption: null,
  modeName: "",
  staticPartitionMB: 0,

  
  segmentation: {
    segments: [],      
    freeList: [],      
    processMap: {},    
  },

  
  pagination: {
    frames: [],        
    processMap: {},    
  },
};

const ui = {
  sidebar:        document.getElementById("sidebar"),
  board:          document.getElementById("board"),
  overlay:        document.getElementById("overlay"),
  programContainer: document.getElementById("programContainer"),
  toggleSidebar:  document.getElementById("toggleSidebar"),
  openForm:       document.getElementById("openForm"),
  stackPanel:     document.getElementById("stackPanel"),
  debugFill:      document.getElementById("debugFill"),
};

function isStaticFixedRoute(r)       { return r === "/static"; }
function isStaticVariableRoute(r)    { return r.startsWith("/variable"); }
function isDynamicNoCompactionRoute(r){ return r.startsWith("/dinamico-sin-compactacion"); }
function isDynamicCompactionRoute(r) { return r === "/dinamico-con-compactacion"; }
function isDynamicRoute(r)           { return isDynamicNoCompactionRoute(r) || isDynamicCompactionRoute(r); }
function isSegmentationRoute(r)      { return r.startsWith("/segmentacion"); }
function isPaginationRoute(r)        { return r === "/paginacion"; }

function GetIndexFA(processes, memoryProcess) {
  for (let i = 0; i < processes.length; i++) {
    if (processes[i].partitionBytes >= memoryProcess && processes[i].id === 0) return i;
  }
  return -1;
}

function GetIndexBA(processes, memoryProcess) {
  let index = -1, minDiff = -1;
  for (let i = 0; i < processes.length; i++) {
    if (processes[i].partitionBytes >= memoryProcess && processes[i].id === 0) {
      const diff = processes[i].partitionBytes - memoryProcess;
      if (minDiff === -1 || diff < minDiff) { minDiff = diff; index = i; }
    }
  }
  return index;
}

function GetIndexWA(processes, memoryProcess) {
  let index = -1, max = 0;
  for (let i = 0; i < processes.length; i++) {
    if (processes[i].partitionBytes >= memoryProcess && processes[i].id === 0
        && processes[i].partitionBytes > max) {
      index = i; max = processes[i].partitionBytes;
    }
  }
  return index;
}

function segFreeFA(freeList, size) {
  for (let i = 0; i < freeList.length; i++) {
    if (freeList[i].size >= size) return i;
  }
  return -1;
}
function segFreeBA(freeList, size) {
  let idx = -1, best = Infinity;
  for (let i = 0; i < freeList.length; i++) {
    if (freeList[i].size >= size && freeList[i].size - size < best) {
      best = freeList[i].size - size; idx = i;
    }
  }
  return idx;
}
function segFreeWA(freeList, size) {
  let idx = -1, worst = -1;
  for (let i = 0; i < freeList.length; i++) {
    if (freeList[i].size >= size && freeList[i].size > worst) {
      worst = freeList[i].size; idx = i;
    }
  }
  return idx;
}

function getCurrentAlgorithm() {
  switch (state.currentRoute.toLowerCase()) {
    case "/dinamico-con-compactacion":                return { fn: GetIndexFA, name: "Dinámico con compactación – Primer Ajuste" };
    case "/dinamico-sin-compactacion/peor-ajuste":    return { fn: GetIndexWA, name: "Dinámico sin compactación – Peor Ajuste" };
    case "/dinamico-sin-compactacion/mejor-ajuste":   return { fn: GetIndexBA, name: "Dinámico sin compactación – Mejor Ajuste" };
    case "/dinamico-sin-compactacion/primer-ajuste":  return { fn: GetIndexFA, name: "Dinámico sin compactación – Primer Ajuste" };
    case "/variable/peor-ajuste":                     return { fn: GetIndexWA, name: "Variable estático – Peor Ajuste" };
    case "/variable/mejor-ajuste":                    return { fn: GetIndexBA, name: "Variable estático – Mejor Ajuste" };
    case "/variable/primer-ajuste":                   return { fn: GetIndexFA, name: "Variable estático – Primer Ajuste" };
    case "/static":                                   return { fn: GetIndexFA, name: "Estático tamaño fijo – Primer Ajuste" };
    
    case "/segmentacion/primer-ajuste":               return { fn: segFreeFA,  name: "Segmentación – Primer Ajuste",  isSeg: true };
    case "/segmentacion/mejor-ajuste":                return { fn: segFreeBA,  name: "Segmentación – Mejor Ajuste",   isSeg: true };
    case "/segmentacion/peor-ajuste":                 return { fn: segFreeWA,  name: "Segmentación – Peor Ajuste",    isSeg: true };
    
    case "/paginacion":                               return { fn: null,       name: "Paginación (4 KiB/marco)",      isPag: true };
    default:                                          return { fn: GetIndexFA, name: "Variable estático – Primer Ajuste" };
  }
}

function randomId() { return Math.floor(Math.random() * 1000000) + 1; }
function formatHex(v) { return Number(v).toString(16).toUpperCase().padStart(6, "0"); }
function formatBytes(bytes) {
  const v = Number(bytes);
  if (v >= MB)   return `${(v / MB).toFixed(2)} MiB`;
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KiB`;
  return `${v} B`;
}

function createProcess({ heap, stack, key, id, name, bss, data, txt, base, partitionBytes }) {
  return { heap, stack, key, id, name, bss, data, txt, base, partitionBytes,
           memory: heap + stack + bss + data + txt };
}
function createFreeProcess(index, base, partitionBytes) {
  return createProcess({ heap: 0, stack: 0, key: index, id: 0, name: "0",
                         bss: 0, data: 0, txt: partitionBytes, base, partitionBytes });
}

function getUsedBytes(processes) {
  return processes.filter(p => p.id !== 0).reduce((s, p) => s + p.partitionBytes, 0);
}
function getFreeBytes(processes) {
  return processes.filter(p => p.id === 0).reduce((s, p) => s + p.partitionBytes, 0);
}
function assertAddressingInvariant(processes) {
  let cursor = USER_MEMORY_START;
  for (const p of processes) {
    if (p.base !== cursor) return false;
    cursor += p.partitionBytes;
  }
  return cursor - 1 === MAX_ADDRESS;
}

function restartElements() {
  state.selectedPrograms = [];
  state.memoryState = [OS_RESERVED_BYTES, USER_MEMORY_BYTES];
  state.process = [];
  state.segmentBits = 0;
  state.offset = 0;
  state.staticPartitionMB = 0;
  state.segmentation = { _initialized: false, segments: [], freeList: [], processMap: {} };
  state.pagination   = { frames: [], processMap: {} };
}

function calcBases(partitionSizesBytes) {
  const bases = [];
  let sum = USER_MEMORY_START;
  for (let i = 0; i < partitionSizesBytes.length; i++) { bases[i] = sum; sum += partitionSizesBytes[i]; }
  return bases;
}
function createLayoutFromSizes(sizes) {
  const bases = calcBases(sizes);
  return bases.map((base, i) => createFreeProcess(i, base, sizes[i]));
}
function initVariableProcesses() {
  if (state.process.length > 0) return;
  state.process = createLayoutFromSizes([0.5, 0.5, 1, 1, 2, 2, 4, 4].map(s => s * MB));
}
function initStaticProcesses() {
  if (!state.staticPartitionMB || state.process.length > 0) return;
  const pb = state.staticPartitionMB * MB;
  const reps = USER_MEMORY_BYTES / pb;
  if (!Number.isInteger(reps) || reps <= 0) return;
  state.process = createLayoutFromSizes(Array(reps).fill(pb));
}
function initDynamicProcesses() {
  if (state.process.length > 0) return;
  state.process = [createFreeProcess(0, USER_MEMORY_START, USER_MEMORY_BYTES)];
}

function initSegmentation() {
  state.segmentation = {
    _initialized: true,
    segments:     [],
    freeList:     [{ base: USER_MEMORY_START, size: USER_MEMORY_BYTES }],
    processMap:   {},
  };
}

function allocateSegments(program, algoFn) {
  const heap = 131072, stack = 65536;
  const defs = [
    { type: ".txt",   size: Number(program.txt),  perm: "r-x" },
    { type: ".data",  size: Number(program.data), perm: "rw-" },
    { type: ".bss",   size: Number(program.bss),  perm: "rw-" },
    { type: "heap",   size: heap,                 perm: "rw-" },
    { type: "stack",  size: stack,                perm: "rw-" },
  ];
  const seg = state.segmentation;
  const allocatedSegs = [];

  for (const def of defs) {
    if (def.size === 0) continue;
    const idx = algoFn(seg.freeList, def.size);
    if (idx === -1) {
      
      for (const s of allocatedSegs) freeSegment(s);
      return false;
    }
    const hole = seg.freeList[idx];
    const segEntry = {
      pid:   program.id,
      name:  program.name,
      type:  def.type,
      base:  hole.base,
      limit: def.size,
      perm:  def.perm,
    };
    allocatedSegs.push(segEntry);
    seg.segments.push(segEntry);

    
    if (hole.size === def.size) {
      seg.freeList.splice(idx, 1);
    } else {
      seg.freeList[idx] = { base: hole.base + def.size, size: hole.size - def.size };
    }
    seg.freeList.sort((a, b) => a.base - b.base);
  }

  if (!seg.processMap[program.id]) seg.processMap[program.id] = [];
  seg.processMap[program.id].push(...allocatedSegs);
  return true;
}

function freeSegment(segEntry) {
  const seg = state.segmentation;
  seg.segments = seg.segments.filter(s => s !== segEntry);
  seg.freeList.push({ base: segEntry.base, size: segEntry.limit });
  mergeSegFreeList();
}

function freeProcessSegments(pid) {
  const seg = state.segmentation;
  const owned = (seg.processMap[pid] || []);
  for (const s of owned) {
    seg.segments = seg.segments.filter(x => x !== s);
    seg.freeList.push({ base: s.base, size: s.limit });
  }
  delete seg.processMap[pid];
  mergeSegFreeList();
}

function mergeSegFreeList() {
  const fl = state.segmentation.freeList.sort((a, b) => a.base - b.base);
  const merged = [];
  for (const hole of fl) {
    const last = merged[merged.length - 1];
    if (last && last.base + last.size === hole.base) {
      last.size += hole.size;
    } else {
      merged.push({ ...hole });
    }
  }
  state.segmentation.freeList = merged;
}

function initPagination() {
  state.pagination = {
    frames:     new Array(TOTAL_FRAMES).fill(null),
    processMap: {},
  };
}

function allocatePages(program) {
  const pag = state.pagination;
  const heap = 131072, stack = 65536;
  const totalBytes = Number(program.txt) + Number(program.data) + Number(program.bss) + heap + stack;
  const pagesNeeded = Math.ceil(totalBytes / PAGE_SIZE);

  
  const freeFrames = [];
  for (let i = 0; i < TOTAL_FRAMES && freeFrames.length < pagesNeeded; i++) {
    if (pag.frames[i] === null) freeFrames.push(i);
  }
  if (freeFrames.length < pagesNeeded) return false;

  for (let i = 0; i < pagesNeeded; i++) {
    pag.frames[freeFrames[i]] = { pid: program.id, name: program.name, pageIndex: i };
  }
  pag.processMap[program.id] = {
    name:   program.name,
    pages:  freeFrames,
    total:  totalBytes,
    txt:    Number(program.txt),
    data:   Number(program.data),
    bss:    Number(program.bss),
    heap,
    stack,
  };
  return true;
}

function freeProcessPages(pid) {
  const pag = state.pagination;
  const proc = pag.processMap[pid];
  if (!proc) return;
  for (const fi of proc.pages) pag.frames[fi] = null;
  delete pag.processMap[pid];
}

function getRouteDefinition(route) {
  const n = route.toLowerCase();
  for (const opt of optionsMemory) {
    if (!opt.hasMenu && opt.route.toLowerCase() === n) return opt;
    if (opt.hasMenu) {
      const found = opt.subOptions.find(s => s.route.toLowerCase() === n);
      if (found) return found;
    }
  }
  return null;
}

function normalizeRoute(rawRoute) {
  const route = String(rawRoute || "").trim();
  if (!route || route === "/") return "/form";
  return route.startsWith("/") ? route : `/${route}`;
}

function setRoute(route) {
  const nr = normalizeRoute(route);
  const def = getRouteDefinition(nr);
  const known = Boolean(def) || nr === "/form";

  state.currentRoute = known ? nr : "/form";
  state.isFormOpen   = state.currentRoute === "/form";

  if (!state.isFormOpen) {
    restartElements();
    if (isSegmentationRoute(state.currentRoute)) initSegmentation();
    else if (isPaginationRoute(state.currentRoute)) initPagination();
    else if (def?.implemented && isStaticVariableRoute(state.currentRoute)) initVariableProcesses();
    else if (def?.implemented && isDynamicRoute(state.currentRoute)) initDynamicProcesses();
  }

  renderAll();
}

function deleteSelectedProgram(prog) {
  state.selectedPrograms = state.selectedPrograms.filter(p => p.id !== prog.id);
}

function assignLastSelectedProgram() {
  const def = getRouteDefinition(state.currentRoute);
  if (!def?.implemented) return;

  const algo = getCurrentAlgorithm();
  const lastProg = state.selectedPrograms[state.selectedPrograms.length - 1];
  if (!lastProg) return;

  const heap = 131072, stack = 65536;
  const totalMem = Number(lastProg.txt) + Number(lastProg.data) + Number(lastProg.bss) + heap + stack;

  
  if (algo.isSeg) {
    if (!state.segmentation._initialized) initSegmentation();
    const ok = allocateSegments(lastProg, algo.fn);
    if (!ok) {
      deleteSelectedProgram(lastProg);
      alert("No hay fragmentos libres suficientes para todos los segmentos del proceso.");
    }
    return;
  }

  
  if (algo.isPag) {
    if (!state.pagination.frames.length) initPagination();
    const ok = allocatePages(lastProg);
    if (!ok) {
      deleteSelectedProgram(lastProg);
      alert("No hay suficientes marcos de página libres.");
    }
    return;
  }

  
  if (isStaticFixedRoute(state.currentRoute))   initStaticProcesses();
  if (isStaticVariableRoute(state.currentRoute)) initVariableProcesses();
  if (isDynamicRoute(state.currentRoute))        initDynamicProcesses();

  const existence = state.process.some(p => p.id === lastProg.id);
  if (existence) return;

  if (totalMem > USER_MEMORY_BYTES) {
    deleteSelectedProgram(lastProg);
    alert("El proceso excede la memoria de usuario disponible (15 MiB)");
    return;
  }

  let index = algo.fn(state.process, totalMem);

  if (index === -1 && isDynamicCompactionRoute(state.currentRoute) && getFreeBytes(state.process) >= totalMem) {
    compactMemory();
    index = algo.fn(state.process, totalMem);
  }
  if (index === -1) {
    deleteSelectedProgram(lastProg);
    alert("No hay suficiente memoria contigua.");
    return;
  }

  const target = state.process[index];
  const allocBytes = isDynamicRoute(state.currentRoute) ? totalMem : target.partitionBytes;
  const newProc = createProcess({
    heap, stack,
    key:           lastProg.key,
    id:            lastProg.id,
    name:          lastProg.name,
    bss:           Number(lastProg.bss),
    data:          Number(lastProg.data),
    txt:           Number(lastProg.txt),
    base:          target.base,
    partitionBytes: allocBytes,
  });

  if (!isDynamicRoute(state.currentRoute)) {
    state.process = [...state.process.slice(0, index), newProc, ...state.process.slice(index + 1)];
    return;
  }

  const remaining = target.partitionBytes - totalMem;
  if (remaining === 0) {
    state.process = [...state.process.slice(0, index), newProc, ...state.process.slice(index + 1)];
  } else {
    const tail = createFreeProcess(index + 1, target.base + totalMem, remaining);
    state.process = [...state.process.slice(0, index), newProc, tail, ...state.process.slice(index + 1)];
  }

  if (!assertAddressingInvariant(state.process)) {
    alert("Inconsistencia de direccionamiento detectada.");
    restartElements();
    setRoute(state.currentRoute);
  }
}

function deleteProcessById(id) {
  
  if (isSegmentationRoute(state.currentRoute)) {
    freeProcessSegments(id);
    deleteSelectedProgram({ id });
    renderBoard();
    return;
  }
  
  if (isPaginationRoute(state.currentRoute)) {
    freeProcessPages(id);
    deleteSelectedProgram({ id });
    renderBoard();
    return;
  }
  
  const index = state.process.findIndex(p => p.id === id);
  if (index === -1) return;
  const current = state.process[index];
  const free = createFreeProcess(index, current.base, current.partitionBytes);
  state.process = [...state.process.slice(0, index), free, ...state.process.slice(index + 1)];
  deleteSelectedProgram(current);
  if (isDynamicRoute(state.currentRoute)) mergeAdjacentFreeBlocks();
  if (isDynamicCompactionRoute(state.currentRoute)) compactMemory();
  renderBoard();
}

function mergeAdjacentFreeBlocks() {
  if (!isDynamicRoute(state.currentRoute) || state.process.length === 0) return;
  const merged = [];
  for (const block of state.process) {
    const last = merged[merged.length - 1];
    if (last && last.id === 0 && block.id === 0) {
      last.partitionBytes += block.partitionBytes;
      last.txt = last.partitionBytes;
      last.memory = last.partitionBytes;
    } else {
      merged.push({ ...block });
    }
  }
  state.process = merged;
}

function compactMemory() {
  if (!isDynamicRoute(state.currentRoute)) return;
  const occupied = state.process.filter(p => p.id !== 0);
  const compacted = [];
  let nextBase = USER_MEMORY_START;
  for (const p of occupied) {
    compacted.push({ ...p, base: nextBase });
    nextBase += p.partitionBytes;
  }
  const freeBytes = USER_MEMORY_BYTES - getUsedBytes(compacted);
  if (freeBytes > 0) compacted.push(createFreeProcess(compacted.length, nextBase, freeBytes));
  state.process = compacted;
}

function pickProgram(program) {
  if (state.isFormOpen) return;
  const instance = { ...program, key: randomId(), id: randomId() };
  state.selectedPrograms = [...state.selectedPrograms, instance];
  assignLastSelectedProgram();
  renderBoard();
}

function renderMemorySummary(processes, modeName) {
  const used = getUsedBytes(processes);
  const free = getFreeBytes(processes);
  const occupiedBlocks = processes.filter(p => p.id !== 0).length;
  const freeBlocks     = processes.filter(p => p.id === 0).length;
  const occupancy = Math.round((used / USER_MEMORY_BYTES) * 100);
  return `
    <section class="memory-summary" aria-label="Resumen de memoria">
      <div class="summary-title">${modeName}</div>
      <div class="summary-grid">
        <article class="summary-card summary-card-used"><span>Uso</span><strong>${formatBytes(used)}</strong></article>
        <article class="summary-card summary-card-free"><span>Libre</span><strong>${formatBytes(free)}</strong></article>
        <article class="summary-card"><span>Particiones ocupadas</span><strong>${occupiedBlocks}</strong></article>
        <article class="summary-card"><span>Huecos libres</span><strong>${freeBlocks}</strong></article>
      </div>
      <div class="memory-legend" aria-label="Leyenda de memoria">
        <div class="legend-item"><span class="legend-swatch legend-swatch-used"></span><span>Proceso usado</span></div>
        <div class="legend-item"><span class="legend-swatch legend-swatch-free"></span><span>Espacio libre</span></div>
        <div class="legend-item"><span class="legend-swatch legend-swatch-os"></span><span>Sistema operativo</span></div>
      </div>
      <div class="occupancy-wrap">
        <div class="occupancy-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${occupancy}">
          <div class="occupancy-fill" style="width:${occupancy}%"></div>
        </div>
        <span class="occupancy-label">Ocupación: ${occupancy}%</span>
      </div>
    </section>`;
}

function renderTable(processes, modeName) {
  const rows = processes.map(p => {
    const pid = p.id === 0 ? "—" : `P${p.id}`;
    return `<tr>
      <td>${pid}</td><td>${p.partitionBytes}</td>
      <td>${p.base}</td><td>${formatHex(p.base)}</td>
    </tr>`;
  }).join("");
  return `
    <div class="datos">
      <div class="titulo"><h1>${modeName}</h1></div>
      <table>
        <thead>
          <tr><td rowspan="2">PID</td><td rowspan="2">Tamaño (B)</td><td colspan="2">Dirección base</td></tr>
          <tr><td>Decimal</td><td>Hexadecimal</td></tr>
        </thead>
        <tbody>
          <tr><td>SO</td><td>${OS_RESERVED_BYTES}</td><td>0</td><td>000000</td></tr>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

function renderStack(processes) {
  const reversed = [...processes].reverse();
  const stack = reversed.map(p => {
    const totalHeight = Math.max(120, (p.partitionBytes * 75) / MB);
    if (p.id === 0) return `
      <article class="stack-block stack-block-free" style="min-height:${totalHeight}px">
        <div class="stack-block-inner">
          <div class="stack-block-top">
            <span class="stack-pill">Hueco libre</span>
            <span class="stack-bytes">${formatBytes(p.partitionBytes)}</span>
          </div>
          <div class="stack-block-body">
            <div class="stack-block-title">Espacio disponible</div>
            <div class="stack-block-range">${formatHex(p.base)} – ${formatHex(p.base + p.partitionBytes - 1)}</div>
            <div class="stack-mini-meter"><span style="width:100%"></span></div>
            <div class="stack-block-meta"><span>Fragmento libre</span><span>${formatBytes(p.partitionBytes)}</span></div>
          </div>
        </div>
      </article>`;

    const usedPct = Math.max(6, Math.min(100, Math.round((p.memory / p.partitionBytes) * 100)));
    const freeB   = Math.max(0, p.partitionBytes - p.memory);
    const isCompact = totalHeight < 118, isTiny = totalHeight < 86;
    return `
      <article class="stack-block stack-block-used ${isTiny?"is-tiny":isCompact?"is-compact":""}" style="min-height:${totalHeight}px">
        <div class="stack-block-inner">
          <div class="stack-block-top">
            <span class="stack-pill stack-pill-used">${p.name}</span>
            <span class="stack-bytes">${formatBytes(p.memory)} usados</span>
          </div>
          <div class="stack-block-body">
            <div class="stack-block-title">${p.name}</div>
            <div class="stack-block-range">${formatHex(p.base)} – ${formatHex(p.base + p.partitionBytes - 1)}</div>
            <div class="stack-mini-meter"><span style="width:${usedPct}%"></span></div>
            <div class="stack-block-meta">
              <span>${formatBytes(p.memory)} ocupados</span>
              <span>${formatBytes(freeB)} libres</span>
            </div>
            <button class="stack-action" data-delete-id="${p.id}" aria-label="Liberar ${p.name}">Liberar</button>
          </div>
        </div>
      </article>`;
  }).join("");

  return `
    <div id="memoria" class="stack-panel">
      <div class="stack-header">
        <div>
          <span class="stack-eyebrow">Memoria de usuario</span>
          <h2 class="stack-title">Pila</h2>
        </div>
        <div class="stack-direction"><span>Dirección alta</span><span>Dirección baja</span></div>
      </div>
      <div class="stack-track">
        ${stack}
        <article class="stack-block stack-block-os" style="min-height:80px"><span>Sistema Operativo</span></article>
      </div>
    </div>`;
}

function renderSegmentationBoard(modeName) {
  const seg = state.segmentation;
  const totalUsed = seg.segments.reduce((s, x) => s + x.limit, 0);
  const totalFree = seg.freeList.reduce((s, x) => s + x.size, 0);
  const occupancy = Math.round((totalUsed / USER_MEMORY_BYTES) * 100);
  const fragCount = seg.freeList.length;

  
  const summary = `
    <section class="memory-summary" aria-label="Resumen Segmentación">
      <div class="summary-title">${modeName}</div>
      <div class="summary-grid">
        <article class="summary-card summary-card-used"><span>Usado</span><strong>${formatBytes(totalUsed)}</strong></article>
        <article class="summary-card summary-card-free"><span>Libre</span><strong>${formatBytes(totalFree)}</strong></article>
        <article class="summary-card"><span>Segmentos activos</span><strong>${seg.segments.length}</strong></article>
        <article class="summary-card"><span>Fragmentos libres</span><strong>${fragCount}</strong></article>
      </div>
      <div class="occupancy-wrap">
        <div class="occupancy-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${occupancy}">
          <div class="occupancy-fill" style="width:${occupancy}%"></div>
        </div>
        <span class="occupancy-label">Ocupación: ${occupancy}%</span>
      </div>
    </section>`;

  
  const segRows = seg.segments.map(s => `
    <tr>
      <td>P${s.pid}</td>
      <td>${s.name}</td>
      <td><span class="seg-type-badge seg-type-${s.type.replace('.','')}">${s.type}</span></td>
      <td>${formatHex(s.base)}</td>
      <td>${formatHex(s.base + s.limit - 1)}</td>
      <td>${formatBytes(s.limit)}</td>
      <td><code>${s.perm}</code></td>
      <td><button class="stack-action seg-free-btn" data-delete-id="${s.pid}" style="font-size:11px;padding:5px 10px;">Liberar proc.</button></td>
    </tr>`).join("");

  
  const holeRows = seg.freeList.map((h, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td>${formatHex(h.base)}</td>
      <td>${formatHex(h.base + h.size - 1)}</td>
      <td>${formatBytes(h.size)}</td>
    </tr>`).join("");

  const table = `
    <div class="datos seg-datos">
      <div class="titulo"><h1>Tabla de Segmentos</h1></div>
      <table>
        <thead>
          <tr>
            <th>PID</th><th>Proceso</th><th>Tipo</th>
            <th>Base</th><th>Límite (fin)</th><th>Tamaño</th><th>Permisos</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${segRows || '<tr><td colspan="8" style="text-align:center;opacity:.6">Sin segmentos asignados</td></tr>'}
        </tbody>
      </table>

      <div class="titulo" style="margin-top:18px"><h1>Lista de Huecos Libres</h1></div>
      <table>
        <thead>
          <tr><th>#</th><th>Base</th><th>Fin</th><th>Tamaño</th></tr>
        </thead>
        <tbody>
          ${holeRows || '<tr><td colspan="4" style="text-align:center;opacity:.6">Memoria totalmente ocupada</td></tr>'}
        </tbody>
      </table>
    </div>`;

  
  const mapHtml = renderSegmentMap(seg);

  return `${summary}<section class="board-main">${table}${mapHtml}</section>`;
}

function renderSegmentMap(seg) {
  
  const blocks = [];
  for (const s of seg.segments)  blocks.push({ type: "used", base: s.base, size: s.limit, label: `${s.name} ${s.type}`, pid: s.pid });
  for (const h of seg.freeList)  blocks.push({ type: "free", base: h.base, size: h.size,  label: "Libre" });
  blocks.sort((a, b) => a.base - b.base);

  const COLORS = ["#e07c3a","#d45f9a","#6a8fe8","#59b89a","#c97dd4","#e8b04e","#7bc4c4"];
  const pidColor = {};
  let colorIdx = 0;

  const bars = blocks.map(b => {
    const pct = (b.size / USER_MEMORY_BYTES) * 100;
    const minH = 24;
    const h = Math.max(minH, pct * 5);
    if (b.type === "free") {
      return `<div class="seg-map-block seg-map-free" style="height:${h}px" title="Libre: ${formatBytes(b.size)}  ${formatHex(b.base)}">
        <span class="seg-map-label">Libre ${formatBytes(b.size)}</span>
        <span class="seg-map-addr">${formatHex(b.base)}</span>
      </div>`;
    }
    if (!pidColor[b.pid]) pidColor[b.pid] = COLORS[colorIdx++ % COLORS.length];
    return `<div class="seg-map-block seg-map-used" style="height:${h}px;background:${pidColor[b.pid]}66;border-left:3px solid ${pidColor[b.pid]}" title="${b.label}  ${formatBytes(b.size)}  ${formatHex(b.base)}">
      <span class="seg-map-label">${b.label}</span>
      <span class="seg-map-addr">${formatHex(b.base)}</span>
    </div>`;
  }).join("");

  return `
    <div id="memoria" class="stack-panel seg-map-panel">
      <div class="stack-header">
        <div><span class="stack-eyebrow">Vista física</span><h2 class="stack-title">Mapa de Memoria</h2></div>
      </div>
      <div class="seg-map-track">
        <div class="seg-map-os">SO (${formatBytes(OS_RESERVED_BYTES)})<span>000000</span></div>
        ${bars}
        <div class="seg-map-end">Fin: FFFFFF</div>
      </div>
    </div>`;
}

function renderPaginationBoard(modeName) {
  const pag = state.pagination;
  const totalFrames = TOTAL_FRAMES;
  const usedFrames  = pag.frames.filter(f => f !== null).length;
  const freeFrames  = totalFrames - usedFrames;
  const occupancy   = Math.round((usedFrames / totalFrames) * 100);

  const summary = `
    <section class="memory-summary" aria-label="Resumen Paginación">
      <div class="summary-title">${modeName}</div>
      <div class="summary-grid">
        <article class="summary-card summary-card-used"><span>Marcos usados</span><strong>${usedFrames}</strong></article>
        <article class="summary-card summary-card-free"><span>Marcos libres</span><strong>${freeFrames}</strong></article>
        <article class="summary-card"><span>Total marcos</span><strong>${totalFrames}</strong></article>
        <article class="summary-card"><span>Tamaño página</span><strong>${formatBytes(PAGE_SIZE)}</strong></article>
      </div>
      <div class="seg-info-strip">
        <span>Espacio total usuario: <strong>${formatBytes(USER_MEMORY_BYTES)}</strong></span>
        <span>Memoria usada: <strong>${formatBytes(usedFrames * PAGE_SIZE)}</strong></span>
        <span>Fragmentación interna: <strong>solo última página</strong></span>
      </div>
      <div class="occupancy-wrap">
        <div class="occupancy-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${occupancy}">
          <div class="occupancy-fill" style="width:${occupancy}%"></div>
        </div>
        <span class="occupancy-label">Marcos ocupados: ${occupancy}%</span>
      </div>
    </section>`;

  
  const procRows = Object.entries(pag.processMap).map(([pid, proc]) => {
    const pages = proc.pages;
    const internalFrag = (pages.length * PAGE_SIZE) - proc.total;
    return `<tr>
      <td>P${pid}</td>
      <td>${proc.name}</td>
      <td>${pages.length}</td>
      <td>${formatBytes(proc.total)}</td>
      <td>${formatBytes(pages.length * PAGE_SIZE)}</td>
      <td class="frag-cell">${formatBytes(internalFrag)}</td>
      <td>
        <button class="stack-action" data-delete-id="${pid}" style="font-size:11px;padding:5px 10px;">Liberar</button>
      </td>
    </tr>`;
  }).join("");

  const procTable = `
    <div class="datos pag-datos">
      <div class="titulo"><h1>Tabla de Procesos</h1></div>
      <table>
        <thead>
          <tr>
            <th>PID</th><th>Nombre</th><th>Páginas</th>
            <th>Tamaño real</th><th>Memoria asignada</th><th>Frag. interna</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${procRows || '<tr><td colspan="7" style="text-align:center;opacity:.6">Sin procesos cargados</td></tr>'}
        </tbody>
      </table>

      ${Object.keys(pag.processMap).length > 0 ? renderPageTable() : ""}
    </div>`;

  const mapHtml = renderFrameMap();
  return `${summary}<section class="board-main">${procTable}${mapHtml}</section>`;
}

function renderPageTable() {
  const pag = state.pagination;
  
  const pids = Object.keys(pag.processMap);
  if (pids.length === 0) return "";
  const pid = pids[pids.length - 1];
  const proc = pag.processMap[pid];

  const rows = proc.pages.map((frameIdx, pi) => {
    const physAddr = USER_MEMORY_START + frameIdx * PAGE_SIZE;
    return `<tr>
      <td>${pi}</td>
      <td>${frameIdx}</td>
      <td>${formatHex(physAddr)}</td>
      <td>${formatHex(physAddr + PAGE_SIZE - 1)}</td>
    </tr>`;
  }).join("");

  return `
    <div class="titulo" style="margin-top:18px"><h1>Tabla de Páginas – ${proc.name} (P${pid})</h1></div>
    <table>
      <thead><tr><th>Página lógica</th><th>Marco físico</th><th>Dir. base física</th><th>Dir. fin física</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderFrameMap() {
  const pag = state.pagination;
  const DISPLAY = 512; 
  const COLS = 32;
  const ROWS = Math.ceil(DISPLAY / COLS);

  const COLORS = ["#e07c3a","#d45f9a","#6a8fe8","#59b89a","#c97dd4","#e8b04e","#7bc4c4","#a0c45e"];
  const pidColor = {};
  let colorIdx = 0;

  let cells = "";
  for (let i = 0; i < DISPLAY; i++) {
    const frame = pag.frames[i];
    if (!frame) {
      cells += `<div class="frame-cell frame-free" title="Marco ${i} – Libre"></div>`;
    } else {
      if (!pidColor[frame.pid]) pidColor[frame.pid] = COLORS[colorIdx++ % COLORS.length];
      cells += `<div class="frame-cell frame-used" style="background:${pidColor[frame.pid]}" title="Marco ${i} – ${frame.name} pág.${frame.pageIndex}"></div>`;
    }
  }

  
  const legend = Object.entries(pag.processMap).map(([pid, proc]) => {
    if (!pidColor[pid]) return "";
    return `<div class="pag-legend-item"><span class="pag-swatch" style="background:${pidColor[pid]}"></span>${proc.name}</div>`;
  }).join("");

  return `
    <div id="memoria" class="stack-panel pag-map-panel">
      <div class="stack-header">
        <div><span class="stack-eyebrow">Vista física (marcos ${0}–${DISPLAY - 1} de ${TOTAL_FRAMES})</span>
          <h2 class="stack-title">Mapa de Marcos</h2></div>
      </div>
      <div class="pag-legend">${legend || '<span style="opacity:.5">Sin procesos</span>'}</div>
      <div class="frame-grid" style="grid-template-columns:repeat(${COLS},1fr)">${cells}</div>
      <div class="pag-map-note">
        Cada celda = 1 marco = ${formatBytes(PAGE_SIZE)} · Mostrando ${DISPLAY}/${TOTAL_FRAMES} marcos
      </div>
    </div>`;
}

function renderNotImplemented(route) {
  return `<div class="notice"><h2>Ruta pendiente</h2><p>La ruta <strong>${route}</strong> aún no fue implementada.</p></div>`;
}

function renderStaticSetup() {
  return `
    <form class="get-data" id="staticConfigForm">
      <h2>Estático</h2>
      <label for="partitionMb">Tamaño de cada partición en MB</label>
      <input id="partitionMb" type="number" min="1" step="1" required />
      <button type="submit">Continuar</button>
    </form>`;
}

function renderForm() {
  return `
    <div class="container_form">
      <h2>Cree su nuevo programa</h2>
      <form id="programForm">
        <label for="nombre">Nombre Programa</label>
        <input type="text" id="nombre" name="nombre" required />
        <label for="dato1">.txt (bytes)</label>
        <input type="number" id="dato1" name="dato1" required />
        <label for="dato2">.data (bytes)</label>
        <input type="number" id="dato2" name="dato2" required />
        <label for="dato3">.bss (bytes)</label>
        <input type="number" id="dato3" name="dato3" required />
        <button type="submit">Enviar</button>
      </form>
    </div>`;
}

function renderProgramContainer() {
  const cards = state.programs.map(p => `
    <article class="program-card" data-pick-key="${p.key}" tabindex="0" role="button" aria-label="Cargar ${p.name}">
      <div class="program-card-head">
        <button class="botonesP" data-pick-key="${p.key}">${p.name}</button>
        <span class="info">${formatBytes(Number(p.txt) + Number(p.data) + Number(p.bss))}</span>
      </div>
      <div class="program-meta">
        <span><strong>.txt</strong> ${formatBytes(p.txt)}</span>
        <span><strong>.data</strong> ${formatBytes(p.data)}</span>
        <span><strong>.bss</strong> ${formatBytes(p.bss)}</span>
      </div>
    </article>`).join("");

  const loadedPids =
    isSegmentationRoute(state.currentRoute)
      ? Object.keys(state.segmentation.processMap).length
      : isPaginationRoute(state.currentRoute)
        ? Object.keys(state.pagination.processMap).length
        : state.process.filter(p => p.id !== 0).length;

  ui.programContainer.innerHTML = `
    <h1>Programas</h1>
    <div class="program-overview">
      <div class="overview-item"><span>Catálogo</span><strong>${state.programs.length}</strong></div>
      <div class="overview-item"><span>En memoria</span><strong>${loadedPids}</strong></div>
    </div>
    <div class="programs">
      <div class="botonesProgramas">${cards}${state.programs.length === 0 ? '<p class="empty-programs">Sin programas</p>' : ""}</div>
    </div>`;
}

function renderSidebar() {
  ui.sidebar.className = state.isSidebarOpen ? "sidebar_Open" : "sidebar_Close";
  ui.overlay.classList.toggle("hidden", !state.isSidebarOpen);

  const content = optionsMemory.map(option => {
    if (!option.hasMenu) {
      return `<div class="row"><button class="sidebar-option" data-route="${option.route}">${option.name}</button></div>`;
    }
    const opened = state.selectedOption === option.key;
    const sub = opened
      ? `<div class="menuContent">${option.subOptions
          .map(s => `<button class="sidebar-option" data-route="${s.route}">${s.name}</button>`)
          .join("")}</div>`
      : "";
    return `<div class="row">
      <button class="sidebar-option" data-open-submenu="${option.key}">${option.name}</button>
      ${sub}
    </div>`;
  }).join("");

  ui.sidebar.innerHTML = `<div class="sidebar-content">${content}</div>`;
}

function renderBoard() {
  const memoriaEl = document.getElementById("memoria");
  const memoriaScroll = memoriaEl?.scrollTop || 0;

  if (state.isFormOpen) { ui.board.innerHTML = renderForm(); return; }

  const def = getRouteDefinition(state.currentRoute);
  if (!def?.implemented) { ui.board.innerHTML = renderNotImplemented(state.currentRoute); return; }

  const algo = getCurrentAlgorithm();

  
  if (algo.isSeg) {
    ui.board.innerHTML = renderSegmentationBoard(algo.name);
    if (ui.stackPanel) ui.stackPanel.innerHTML = "";
    return;
  }

  
  if (algo.isPag) {
    ui.board.innerHTML = renderPaginationBoard(algo.name);
    if (ui.stackPanel) ui.stackPanel.innerHTML = "";
    return;
  }

  
  if (state.currentRoute === "/static" && !state.staticPartitionMB) {
    ui.board.innerHTML = renderStaticSetup(); return;
  }
  if (isStaticFixedRoute(state.currentRoute))    initStaticProcesses();
  if (isStaticVariableRoute(state.currentRoute)) initVariableProcesses();
  if (isDynamicRoute(state.currentRoute))        initDynamicProcesses();

  ui.board.innerHTML = `
    ${renderMemorySummary(state.process, algo.name)}
    <section class="board-main">
      ${renderTable(state.process, algo.name)}
    </section>`;

  if (ui.stackPanel) ui.stackPanel.innerHTML = renderStack(state.process);

  requestAnimationFrame(() => {
    const el = document.getElementById("memoria");
    if (el) el.scrollTop = memoriaScroll;
  });
}

function renderAll() {
  renderSidebar();
  renderProgramContainer();
  renderBoard();
}

function bindEvents() {
  ui.toggleSidebar.addEventListener("click", () => {
    state.isSidebarOpen = !state.isSidebarOpen;
    renderSidebar();
  });

  ui.openForm.addEventListener("click", () => {
    state.currentRoute = "/form";
    state.isFormOpen = true;
    window.location.hash = "#/form";
    renderBoard();
  });

  ui.debugFill?.addEventListener("click", () => {
    const partsMB = [1, 0.5, 0.75, 1, 0.5, 2, 0.25, 0.5, 1, 0.75, 0.5, 1];
    const parts = partsMB.map(m => Math.round(m * MB));
    const blocks = [];
    let base = USER_MEMORY_START;
    for (let i = 0; i < parts.length; i++) {
      const pb = parts[i];
      const isUsed = i % 3 !== 0;
      if (isUsed) {
        const memUsed = Math.max(Math.round(pb * 0.75), Math.round(pb - 0.05 * MB));
        blocks.push(createProcess({
          heap: 131072, stack: 65536, key: randomId(), id: randomId(),
          name: `Tst${i + 1}`, bss: 1024, data: 2048,
          txt: memUsed - 131072 - 65536 - 1024 - 2048, base, partitionBytes: pb,
        }));
      } else {
        blocks.push(createFreeProcess(blocks.length, base, pb));
      }
      base += pb;
    }
    const residual = USER_MEMORY_BYTES - blocks.reduce((s, b) => s + b.partitionBytes, 0);
    if (residual > 0) blocks.push(createFreeProcess(blocks.length, base, residual));

    state.process = blocks;
    state.currentRoute = "/dinamico-con-compactacion";
    state.isFormOpen = false;
    renderAll();
  });

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-route],[data-open-submenu],[data-pick-key],[data-delete-id]");
    if (!target) return;

    const route = target.getAttribute("data-route");
    if (route) { state.isSidebarOpen = false; window.location.hash = `#${route}`; return; }

    const submenu = target.getAttribute("data-open-submenu");
    if (submenu) {
      const k = Number(submenu);
      state.selectedOption = state.selectedOption === k ? null : k;
      renderSidebar(); return;
    }

    const pickKey = target.getAttribute("data-pick-key");
    if (pickKey) {
      const prog = state.programs.find(p => String(p.key) === String(pickKey));
      if (prog) pickProgram(prog); return;
    }

    const deleteId = target.getAttribute("data-delete-id");
    if (deleteId) deleteProcessById(Number(deleteId));
  });

  document.addEventListener("keydown", event => {
    const card = event.target.closest(".program-card");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const prog = state.programs.find(p => String(p.key) === card.getAttribute("data-pick-key"));
    if (prog) pickProgram(prog);
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "programForm") {
      event.preventDefault();
      const fd = new FormData(event.target);
      const txt = Number(fd.get("dato1")), data = Number(fd.get("dato2")), bss = Number(fd.get("dato3"));
      if (txt <= 0 || data < 0 || bss < 0) { alert("Tamaños inválidos (.txt > 0, .data ≥ 0, .bss ≥ 0)"); return; }
      state.programs = [...state.programs, { key: randomId(), id: 0, name: fd.get("nombre"), txt, data, bss }];
      event.target.reset();
      renderProgramContainer(); return;
    }
    if (event.target.id === "staticConfigForm") {
      event.preventDefault();
      const value = Number(document.getElementById("partitionMb").value);
      if (!value || value <= 0 || value > 15 || !Number.isInteger(value)) {
        alert("Tamaño de partición entero entre 1 y 15 MB"); return;
      }
      if (15 % value !== 0) { alert("El tamaño debe dividir exactamente 15 MiB"); return; }
      state.staticPartitionMB = value;
      state.process = [];
      initStaticProcesses();
      renderBoard();
    }
  });

  window.addEventListener("hashchange", () => {
    const route = normalizeRoute((window.location.hash || "#/form").replace("#", ""));
    setRoute(route);
  });
}

async function loadPrograms() {
  try {
    for (const candidate of ["./programas.json", "programas.json"]) {
      try {
        const res = await fetch(candidate);
        if (!res.ok) continue;
        const progs = await res.json();
        if (Array.isArray(progs) && progs.length >= 5) { state.programs = progs; return; }
      } catch (_) {  }
    }
    state.programs = [...DEFAULT_PROGRAMS];
  } catch (e) {
    console.error("No se pudo cargar programas.json", e);
    state.programs = [...DEFAULT_PROGRAMS];
  }
}

async function init() {
  await loadPrograms();
  bindEvents();
  const route = normalizeRoute((window.location.hash || "#/form").replace("#", ""));
  setRoute(route);
}

init();
