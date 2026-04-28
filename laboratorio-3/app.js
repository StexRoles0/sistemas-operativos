const MB = 1024 * 1024;
const TOTAL_MEMORY_BYTES = 16 * MB;
const MAX_ADDRESS = TOTAL_MEMORY_BYTES - 1;
const OS_RESERVED_BYTES = 1 * MB;
const USER_MEMORY_BYTES = TOTAL_MEMORY_BYTES - OS_RESERVED_BYTES;
const USER_MEMORY_START = OS_RESERVED_BYTES;

const DEFAULT_PROGRAMS = [
  { key: 1, id: 0, name: "NotePad", txt: 195240, data: 12352, bss: 1165 },
  { key: 2, id: 0, name: "Word", txt: 775390, data: 32680, bss: 4100 },
  { key: 3, id: 0, name: "Excel", txt: 995420, data: 24245, bss: 7557 },
  { key: 4, id: 0, name: "AutoCad", txt: 1150000, data: 123470, bss: 1123 },
  { key: 5, id: 0, name: "Calculadora", txt: 123420, data: 1246, bss: 1756 },
  { key: 6, id: 0, name: "ProgramaErr", txt: 5250000, data: 3224000, bss: 51000 },
];

const optionsMemory = [
  { key: 1, name: "Estatico tamaño fijo", hasMenu: false, route: "/static", implemented: true },
  {
    key: 2,
    name: "Estatico tamaño variable",
    hasMenu: true,
    subOptions: [
      { key: 21, name: "Primer Ajuste", route: "/variable/primer-ajuste", implemented: true },
      { key: 22, name: "Peor Ajuste", route: "/variable/peor-ajuste", implemented: true },
      { key: 23, name: "Mejor Ajuste", route: "/variable/mejor-ajuste", implemented: true },
    ],
  },
  {
    key: 3,
    name: "Dinamico Sin Compactacion",
    hasMenu: true,
    subOptions: [
      { key: 31, name: "Primer Ajuste", route: "/dinamico-sin-compactacion/primer-ajuste", implemented: true },
      { key: 32, name: "Peor Ajuste", route: "/dinamico-sin-compactacion/peor-ajuste", implemented: true },
      { key: 33, name: "Mejor Ajuste", route: "/dinamico-sin-compactacion/mejor-ajuste", implemented: true },
    ],
  },
  { key: 4, name: "Dinamico Con Compactacion", hasMenu: false, route: "/dinamico-con-compactacion", implemented: true },
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
};

const ui = {
  sidebar: document.getElementById("sidebar"),
  board: document.getElementById("board"),
  overlay: document.getElementById("overlay"),
  programContainer: document.getElementById("programContainer"),
  toggleSidebar: document.getElementById("toggleSidebar"),
  openForm: document.getElementById("openForm"),
  stackPanel: document.getElementById("stackPanel"),
  debugFill: document.getElementById("debugFill"),
};

function GetIndexFA(processes, memoryProcess) {
  for (let i = 0; i < processes.length; i += 1) {
    if (processes[i].partitionBytes >= memoryProcess && processes[i].id === 0) return i;
  }
  return -1;
}

function GetIndexBA(processes, memoryProcess) {
  let index = -1;
  let minDifference = -1;

  for (let i = 0; i < processes.length; i += 1) {
    if (processes[i].partitionBytes >= memoryProcess && processes[i].id === 0) {
      const difference = processes[i].partitionBytes - memoryProcess;
      if (difference >= 0 && (minDifference === -1 || minDifference > difference)) {
        minDifference = difference;
        index = i;
      }
    }
  }

  return index;
}

function GetIndexWA(processes, memoryProcess) {
  let index = -1;
  let max = 0;
  for (let i = 0; i < processes.length; i += 1) {
    if (processes[i].partitionBytes >= memoryProcess && processes[i].id === 0 && max <= processes[i].partitionBytes) {
      index = i;
      max = processes[i].partitionBytes;
    }
  }
  return index;
}

function getCurrentAlgorithm() {
  switch (state.currentRoute.toLowerCase()) {
    case "/dinamico-con-compactacion":
      return { fn: GetIndexFA, name: "Dinámico con compactación - Primer Ajuste" };
    case "/dinamico-sin-compactacion/peor-ajuste":
      return { fn: GetIndexWA, name: "Dinámico sin compactación - Peor Ajuste" };
    case "/dinamico-sin-compactacion/mejor-ajuste":
      return { fn: GetIndexBA, name: "Dinámico sin compactación - Mejor Ajuste" };
    case "/dinamico-sin-compactacion/primer-ajuste":
      return { fn: GetIndexFA, name: "Dinámico sin compactación - Primer Ajuste" };
    case "/variable/peor-ajuste":
      return { fn: GetIndexWA, name: "Variable estático - Peor Ajuste" };
    case "/variable/mejor-ajuste":
      return { fn: GetIndexBA, name: "Variable estático - Mejor Ajuste" };
    case "/variable/primer-ajuste":
      return { fn: GetIndexFA, name: "Variable estático - Primer Ajuste" };
    case "/static":
      return { fn: GetIndexFA, name: "Estático tamaño fijo - Primer Ajuste" };
    default:
      return { fn: GetIndexFA, name: "Variable estático - Primer Ajuste" };
  }
}

function randomId() {
  return Math.floor(Math.random() * 1000000);
}

function createProcess({ heap, stack, key, id, name, bss, data, txt, base, partitionBytes }) {
  return {
    heap,
    stack,
    key,
    id,
    name,
    bss,
    data,
    txt,
    base,
    partitionBytes,
    memory: heap + stack + bss + data + txt,
  };
}

function createFreeProcess(index, base, partitionBytes) {
  return createProcess({
    heap: 0,
    stack: 0,
    key: index,
    id: 0,
    name: "0",
    bss: 0,
    data: 0,
    txt: partitionBytes,
    base,
    partitionBytes,
  });
}

function isStaticFixedRoute(route) {
  return route === "/static";
}

function isStaticVariableRoute(route) {
  return route.startsWith("/variable");
}

function isDynamicNoCompactionRoute(route) {
  return route.startsWith("/dinamico-sin-compactacion");
}

function isDynamicCompactionRoute(route) {
  return route === "/dinamico-con-compactacion";
}

function isDynamicRoute(route) {
  return isDynamicNoCompactionRoute(route) || isDynamicCompactionRoute(route);
}

function getUsedBytes(processes) {
  return processes.filter((process) => process.id !== 0).reduce((sum, process) => sum + process.partitionBytes, 0);
}

function getFreeBytes(processes) {
  return processes.filter((process) => process.id === 0).reduce((sum, process) => sum + process.partitionBytes, 0);
}

function assertAddressingInvariant(processes) {
  let cursor = USER_MEMORY_START;

  for (const process of processes) {
    if (process.base !== cursor) return false;
    cursor += process.partitionBytes;
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
}

function calcBases(partitionSizesBytes) {
  const bases = [];
  let sum = USER_MEMORY_START;
  for (let i = 0; i < partitionSizesBytes.length; i += 1) {
    bases[i] = sum;
    sum += partitionSizesBytes[i];
  }
  return bases;
}

function createLayoutFromSizes(partitionSizesBytes) {
  const bases = calcBases(partitionSizesBytes);
  return bases.map((base, index) => createFreeProcess(index, base, partitionSizesBytes[index]));
}

function initVariableProcesses() {
  if (state.process.length > 0) return;
  const partitionSizesBytes = [0.5, 0.5, 1, 1, 2, 2, 4, 4].map((size) => size * MB);
  state.process = createLayoutFromSizes(partitionSizesBytes);
}

function initStaticProcesses() {
  if (!state.staticPartitionMB || state.process.length > 0) return;
  const partitionBytes = state.staticPartitionMB * MB;
  const repeats = USER_MEMORY_BYTES / partitionBytes;
  if (!Number.isInteger(repeats) || repeats <= 0) return;

  const partitionSizesBytes = Array(repeats).fill(partitionBytes);
  state.process = createLayoutFromSizes(partitionSizesBytes);
}

function initDynamicProcesses() {
  if (state.process.length > 0) return;
  state.process = [createFreeProcess(0, USER_MEMORY_START, USER_MEMORY_BYTES)];
}

function getRouteDefinition(route) {
  const normalized = route.toLowerCase();
  for (const option of optionsMemory) {
    if (!option.hasMenu && option.route.toLowerCase() === normalized) return option;
    if (option.hasMenu) {
      const found = option.subOptions.find((sub) => sub.route.toLowerCase() === normalized);
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
  const normalizedRoute = normalizeRoute(route);
  const routeDef = getRouteDefinition(normalizedRoute);
  const isKnownRoute = Boolean(routeDef) || normalizedRoute === "/form";

  state.currentRoute = isKnownRoute ? normalizedRoute : "/form";
  state.isFormOpen = state.currentRoute === "/form";

  if (!state.isFormOpen) {
    restartElements();
    if (routeDef?.implemented && isStaticVariableRoute(state.currentRoute)) {
      initVariableProcesses();
    }
    if (routeDef?.implemented && isDynamicRoute(state.currentRoute)) initDynamicProcesses();
  }

  renderAll();
}

function deleteSelectedProgram(programToDelete) {
  state.selectedPrograms = state.selectedPrograms.filter((program) => program.id !== programToDelete.id);
}

function assignLastSelectedProgram() {
  const def = getRouteDefinition(state.currentRoute);
  if (!def?.implemented) return;

  if (isStaticFixedRoute(state.currentRoute)) initStaticProcesses();
  if (isStaticVariableRoute(state.currentRoute)) {
    initVariableProcesses();
  }
  if (isDynamicRoute(state.currentRoute)) initDynamicProcesses();

  const { fn } = getCurrentAlgorithm();
  const lastProgram = state.selectedPrograms[state.selectedPrograms.length - 1];
  const existence = state.process.some((process) => process.id === lastProgram?.id);

  const heap = 131072;
  const stack = 65536;

  if (!lastProgram || existence) return;

  const memoryProcess = Number(lastProgram.txt) + Number(lastProgram.data) + Number(lastProgram.bss) + heap + stack;
  if (memoryProcess > USER_MEMORY_BYTES) {
    deleteSelectedProgram(lastProgram);
    alert("El proceso excede la memoria de usuario disponible (15 MiB)");
    return;
  }

  let index = fn(state.process, memoryProcess);

  if (index === -1 && isDynamicCompactionRoute(state.currentRoute) && getFreeBytes(state.process) >= memoryProcess) {
    compactMemory();
    index = fn(state.process, memoryProcess);
  }

  if (index === -1) {
    deleteSelectedProgram(lastProgram);
    alert("No hay suficiente memoria");
    return;
  }

  const target = state.process[index];
  const allocatedBytes = isDynamicRoute(state.currentRoute) ? memoryProcess : target.partitionBytes;
  const newProcess = createProcess({
    heap,
    stack,
    key: lastProgram.key,
    id: lastProgram.id,
    name: lastProgram.name,
    bss: Number(lastProgram.bss),
    data: Number(lastProgram.data),
    txt: Number(lastProgram.txt),
    base: target.base,
    partitionBytes: allocatedBytes,
  });

  if (!isDynamicRoute(state.currentRoute)) {
    state.process = [...state.process.slice(0, index), newProcess, ...state.process.slice(index + 1)];
    return;
  }

  const remaining = target.partitionBytes - memoryProcess;

  if (remaining === 0) {
    state.process = [...state.process.slice(0, index), newProcess, ...state.process.slice(index + 1)];
  } else {
    const tail = createFreeProcess(index + 1, target.base + memoryProcess, remaining);
    state.process = [...state.process.slice(0, index), newProcess, tail, ...state.process.slice(index + 1)];
  }

  if (!assertAddressingInvariant(state.process)) {
    alert("Se detectó una inconsistencia de direccionamiento de memoria");
    restartElements();
    setRoute(state.currentRoute);
  }
}

function deleteProcessById(id) {
  const index = state.process.findIndex((process) => process.id === id);
  if (index === -1) return;

  const current = state.process[index];
  const free = createFreeProcess(index, current.base, current.partitionBytes);

  state.process = [...state.process.slice(0, index), free, ...state.process.slice(index + 1)];
  deleteSelectedProgram(current);

  if (isDynamicRoute(state.currentRoute)) {
    mergeAdjacentFreeBlocks();
  }

  if (isDynamicCompactionRoute(state.currentRoute)) {
    compactMemory();
  }

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
      continue;
    }
    merged.push({ ...block });
  }

  state.process = merged;
}

function compactMemory() {
  if (!isDynamicRoute(state.currentRoute)) return;

  const occupied = state.process.filter((process) => process.id !== 0);
  const compacted = [];
  let nextBase = USER_MEMORY_START;

  for (const process of occupied) {
    compacted.push({
      ...process,
      base: nextBase,
      partitionBytes: process.partitionBytes,
    });
    nextBase += process.partitionBytes;
  }

  const freeBytes = USER_MEMORY_BYTES - getUsedBytes(compacted);
  if (freeBytes > 0) {
    compacted.push(createFreeProcess(compacted.length, nextBase, freeBytes));
  }

  state.process = compacted;
}

function pickProgram(program) {
  if (state.isFormOpen) return;
  const instance = {
    ...program,
    key: randomId(),
    id: randomId(),
  };

  state.selectedPrograms = [...state.selectedPrograms, instance];
  assignLastSelectedProgram();
  renderBoard();
}

function formatHex(value) {
  return Number(value).toString(16).toUpperCase().padStart(6, "0");
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (value >= MB) return `${(value / MB).toFixed(2)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}

function renderMemorySummary(processes, modeName) {
  const used = getUsedBytes(processes);
  const free = getFreeBytes(processes);
  const occupiedBlocks = processes.filter((process) => process.id !== 0).length;
  const freeBlocks = processes.filter((process) => process.id === 0).length;
  const occupancy = Math.round((used / USER_MEMORY_BYTES) * 100);

  return `
    <section class="memory-summary" aria-label="Resumen de memoria">
      <div class="summary-title">${modeName}</div>
      <div class="summary-grid">
        <article class="summary-card summary-card-used">
          <span>Uso</span>
          <strong>${formatBytes(used)}</strong>
        </article>
        <article class="summary-card summary-card-free">
          <span>Libre</span>
          <strong>${formatBytes(free)}</strong>
        </article>
        <article class="summary-card">
          <span>Particiones ocupadas</span>
          <strong>${occupiedBlocks}</strong>
        </article>
        <article class="summary-card">
          <span>Huecos libres</span>
          <strong>${freeBlocks}</strong>
        </article>
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
  const rows = processes
    .map((process) => {
      const pid = process.id === 0 ? 0 : `P${process.id}`;
      return `
        <tr>
          <td>${pid}</td>
          <td>${process.partitionBytes}</td>
          <td>${process.base}</td>
          <td>${formatHex(process.base)}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="datos">
      <div class="titulo"><h1>${modeName}</h1></div>
      <table>
        <thead>
          <tr>
            <td rowspan="2">PID</td>
            <td rowspan="2">Tamaño</td>
            <td colspan="2">Base</td>
          </tr>
          <tr>
            <td>Decimal</td>
            <td>Hexadecimal</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SO</td>
              <td>${OS_RESERVED_BYTES}</td>
            <td>0</td>
            <td>000000</td>
          </tr>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

function renderStack(processes) {
  const reversed = [...processes].reverse();

  const stack = reversed
    .map((process) => {
      // aumentar la altura vertical de los bloques para mejor lectura
      const totalHeight = Math.max(120, (process.partitionBytes * 75) / MB);

      if (process.id === 0) {
        return `
          <article class="stack-block stack-block-free" style="min-height:${totalHeight}px">
            <div class="stack-block-inner">
              <div class="stack-block-top">
                <span class="stack-pill">Hueco libre</span>
                <span class="stack-bytes">${formatBytes(process.partitionBytes)}</span>
              </div>
              <div class="stack-block-body">
                <div class="stack-block-title">Espacio disponible</div>
                <div class="stack-block-range">${formatHex(process.base)} - ${formatHex(process.base + process.partitionBytes - 1)}</div>
                <div class="stack-mini-meter" aria-hidden="true"><span style="width:100%"></span></div>
                <div class="stack-block-meta">
                  <span>Fragmento libre</span>
                  <span>${formatBytes(process.partitionBytes)}</span>
                </div>
              </div>
            </div>
          </article>`;
      }

      const usedRatio = process.partitionBytes > 0 ? (process.memory / process.partitionBytes) * 100 : 0;
      const usedPercentage = Math.max(6, Math.min(100, Math.round(usedRatio)));
      const freeBytes = Math.max(0, process.partitionBytes - process.memory);
      const isCompact = totalHeight < 118;
      const isTiny = totalHeight < 86;

      const modeClass = isTiny ? "is-tiny" : isCompact ? "is-compact" : "";

      return `
        <article class="stack-block stack-block-used ${modeClass}" style="min-height:${totalHeight}px">
          <div class="stack-block-inner">
            <div class="stack-block-top">
              <span class="stack-pill stack-pill-used">${process.name}</span>
              <span class="stack-bytes">${formatBytes(process.memory)} usados</span>
            </div>
            <div class="stack-block-body">
              <div class="stack-block-title">${process.name}</div>
              <div class="stack-block-range">${formatHex(process.base)} - ${formatHex(process.base + process.partitionBytes - 1)}</div>
              <div class="stack-mini-meter" aria-hidden="true">
                <span style="width:${usedPercentage}%"></span>
              </div>
              <div class="stack-block-meta">
                <span>${formatBytes(process.memory)} ocupados</span>
                <span>${formatBytes(freeBytes)} libres</span>
              </div>
              <button class="stack-action" data-delete-id="${process.id}" aria-label="Liberar ${process.name}">Liberar</button>
            </div>
          </div>
        </article>`;
    })
    .join("");

  return `
    <div id="memoria" class="stack-panel">
      <div class="stack-header">
        <div>
          <span class="stack-eyebrow">Memoria de usuario</span>
          <h2 class="stack-title">Pila</h2>
        </div>
        <div class="stack-direction">
          <span>Dirección alta</span>
          <span>Dirección baja</span>
        </div>
      </div>
      <div class="stack-track">
        ${stack}
        <article class="stack-block stack-block-os" style="min-height:80px">
          <span>Sistema Operativo</span>
        </article>
      </div>
    </div>`;
}

function renderNotImplemented(route) {
  return `
    <div class="notice">
      <h2>Ruta pendiente de migración</h2>
      <p>La ruta <strong>${route}</strong> aún no fue portada a JavaScript puro.</p>
      <p>Ya están migradas: <strong>/static</strong>, <strong>/variable/*</strong>, <strong>/dinamico-sin-compactacion/*</strong> y <strong>/dinamico-con-compactacion</strong>.</p>
    </div>`;
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
  const cards = state.programs
    .map(
      (program) => `
      <article class="program-card" data-pick-key="${program.key}" tabindex="0" role="button" aria-label="Cargar ${program.name}">
        <div class="program-card-head">
          <button class="botonesP" data-pick-key="${program.key}">${program.name}</button>
          <span class="info">${formatBytes(Number(program.txt) + Number(program.data) + Number(program.bss))}</span>
        </div>
        <div class="program-meta">
          <span><strong>.txt</strong> ${formatBytes(program.txt)}</span>
          <span><strong>.data</strong> ${formatBytes(program.data)}</span>
          <span><strong>.bss</strong> ${formatBytes(program.bss)}</span>
        </div>
      </article>`,
    )
    .join("");

  const loadedPids = state.process.filter((process) => process.id !== 0).length;
  const availableCatalog = state.programs.length;

  const quickStats = `
    <div class="program-overview">
      <div class="overview-item">
        <span>Catálogo</span>
        <strong>${availableCatalog}</strong>
      </div>
      <div class="overview-item">
        <span>En memoria</span>
        <strong>${loadedPids}</strong>
      </div>
    </div>`;

  const empty =
    state.programs.length === 0
      ? '<p class="empty-programs">No hay programas cargados</p>'
      : "";

  ui.programContainer.innerHTML = `
    <h1>Programas</h1>
    ${quickStats}
    <div class="programs">
      <div class="botonesProgramas">${cards}${empty}</div>
    </div>`;
}

function renderSidebar() {
  ui.sidebar.className = state.isSidebarOpen ? "sidebar_Open" : "sidebar_Close";
  ui.overlay.classList.toggle("hidden", !state.isSidebarOpen);

  const content = optionsMemory
    .map((option) => {
      if (!option.hasMenu) {
        return `<div class="row"><button class="sidebar-option" data-route="${option.route}">${option.name}</button></div>`;
      }

      const opened = state.selectedOption === option.key;
      const sub = opened
        ? `<div class="menuContent">${option.subOptions
            .map((sub) => `<button class="sidebar-option" data-route="${sub.route}">${sub.name}</button>`)
            .join("")}</div>`
        : "";

      return `
        <div class="row">
          <button class="sidebar-option" data-open-submenu="${option.key}">${option.name}</button>
          ${sub}
        </div>`;
    })
    .join("");

  ui.sidebar.innerHTML = `<div class="sidebar-content">${content}</div>`;
}

function renderBoard() {
  // Guardar scroll position de #memoria antes de renderizar (si existe)
  const memoriaElement = document.getElementById('memoria');
  const memoriaScrollTop = memoriaElement?.scrollTop || 0;

  if (state.isFormOpen) {
    ui.board.innerHTML = renderForm();
    return;
  }

  const def = getRouteDefinition(state.currentRoute);
  if (!def?.implemented) {
    ui.board.innerHTML = renderNotImplemented(state.currentRoute);
    return;
  }

  if (state.currentRoute === "/static" && !state.staticPartitionMB) {
    ui.board.innerHTML = renderStaticSetup();
    return;
  }

  if (isStaticFixedRoute(state.currentRoute)) initStaticProcesses();
  if (isStaticVariableRoute(state.currentRoute)) {
    initVariableProcesses();
  }
  if (isDynamicRoute(state.currentRoute)) initDynamicProcesses();

  const mode = getCurrentAlgorithm();
  ui.board.innerHTML = `
    ${renderMemorySummary(state.process, mode.name)}
    <section class="board-main">
      ${renderTable(state.process, mode.name)}
    </section>`;

  // Renderizar la pila en su contenedor separado
  if (ui.stackPanel) ui.stackPanel.innerHTML = renderStack(state.process);

  // Restaurar scroll position de #memoria después de renderizar
  requestAnimationFrame(() => {
    const newMemoriaElement = document.getElementById('#memoria') || document.getElementById('memoria');
    if (newMemoriaElement) newMemoriaElement.scrollTop = memoriaScrollTop;
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
    // Genera un conjunto de procesos (usados y huecos) para probar la pila
    const partsMB = [1, 0.5, 0.75, 1, 0.5, 2, 0.25, 0.5, 1, 0.75, 0.5, 1];
    const parts = partsMB.map((m) => Math.round(m * MB));
    const blocks = [];
    let base = USER_MEMORY_START;
    for (let i = 0; i < parts.length; i++) {
      const pb = parts[i];
      const isUsed = i % 3 !== 0; // algunos usados, otros libres
      if (isUsed) {
        const memUsed = Math.max( Math.round(pb * 0.75), Math.round(pb - (0.05 * MB)) );
        blocks.push(createProcess({
          heap: 131072,
          stack: 65536,
          key: randomId(),
          id: randomId(),
          name: `Tst${i + 1}`,
          bss: 1024,
          data: 2048,
          txt: memUsed - 131072 - 65536 - 1024 - 2048,
          base,
          partitionBytes: pb,
        }));
      } else {
        blocks.push(createFreeProcess(blocks.length, base, pb));
      }
      base += pb;
    }

    // si queda espacio residual, agregamos un hueco final
    const usedSum = blocks.reduce((s, b) => s + b.partitionBytes, 0);
    const residual = USER_MEMORY_BYTES - usedSum;
    if (residual > 0) blocks.push(createFreeProcess(blocks.length, base, residual));

    state.process = blocks;
    state.currentRoute = "/dinamico-con-compactacion";
    state.isFormOpen = false;
    renderAll();
    console.log("Debug: pila rellenada con", state.process.length, "bloques");
    // no forzamos modo debug visual — mantener estilos limpios
  });

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-route], [data-open-submenu], [data-pick-key], [data-delete-id]");
    if (!actionTarget) return;

    const route = actionTarget.getAttribute("data-route");
    if (route) {
      state.isSidebarOpen = false;
      window.location.hash = `#${route}`;
      return;
    }

    const submenu = actionTarget.getAttribute("data-open-submenu");
    if (submenu) {
      const key = Number(submenu);
      state.selectedOption = state.selectedOption === key ? null : key;
      renderSidebar();
      return;
    }

    const pickKey = actionTarget.getAttribute("data-pick-key");
    if (pickKey) {
      const program = state.programs.find((item) => String(item.key) === String(pickKey));
      if (program) pickProgram(program);
      return;
    }

    const deleteId = actionTarget.getAttribute("data-delete-id");
    if (deleteId) {
      deleteProcessById(Number(deleteId));
    }
  });

  document.addEventListener("keydown", (event) => {
    const card = event.target.closest(".program-card");
    if (!card) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    const pickKey = card.getAttribute("data-pick-key");
    const program = state.programs.find((item) => String(item.key) === String(pickKey));
    if (program) pickProgram(program);
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "programForm") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const txt = Number(formData.get("dato1"));
      const data = Number(formData.get("dato2"));
      const bss = Number(formData.get("dato3"));

      if (txt <= 0 || data < 0 || bss < 0) {
        alert("Ingrese tamaños válidos para los segmentos (.txt > 0, .data >= 0, .bss >= 0)");
        return;
      }

      const program = {
        key: randomId(),
        id: 0,
        name: formData.get("nombre"),
        txt,
        data,
        bss,
      };

      state.programs = [...state.programs, program];
      event.target.reset();
      renderProgramContainer();
      return;
    }

    if (event.target.id === "staticConfigForm") {
      event.preventDefault();
      const value = Number(document.getElementById("partitionMb").value);
      if (!value || value <= 0 || value > 15 || !Number.isInteger(value)) {
        alert("Ingrese un tamaño entero de partición válido entre 1 y 15 MB");
        return;
      }

      if (15 % value !== 0) {
        alert("Para cubrir 15 MiB completos, el tamaño de partición debe dividir 15 exactamente");
        return;
      }

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
  const candidates = [
    "./programas.json",
    "programas.json",
  ];

  try {
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) continue;
        const programs = await response.json();
          if (Array.isArray(programs) && programs.length >= 5) {
          state.programs = programs;
          return;
        }
      } catch (_) {
      }
    }

    state.programs = [...DEFAULT_PROGRAMS];
  } catch (error) {
    console.error("No fue posible cargar programas.json", error);
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
