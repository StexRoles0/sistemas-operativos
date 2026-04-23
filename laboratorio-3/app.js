const MB = 1024 * 1024;

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
  memoryState: [1048576, 15728640],
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
};

function GetIndexFA(processes, memoryProcess) {
  for (let i = 0; i < processes.length; i += 1) {
    if (processes[i].partitionBytes > memoryProcess && processes[i].id === 0) return i;
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
    if (processes[i].partitionBytes > memoryProcess && processes[i].id === 0 && max <= processes[i].partitionBytes) {
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
    case "/variable/peor-ajuste":
      return { fn: GetIndexWA, name: "Variable - Peor Ajuste" };
    case "/dinamico-sin-compactacion/mejor-ajuste":
    case "/variable/mejor-ajuste":
      return { fn: GetIndexBA, name: "Variable - Mejor Ajuste" };
    case "/dinamico-sin-compactacion/primer-ajuste":
      return { fn: GetIndexFA, name: "Dinámico sin compactación - Primer Ajuste" };
    case "/static":
      return { fn: GetIndexFA, name: "Estático" };
    default:
      return { fn: GetIndexFA, name: "Variable - Primer Ajuste" };
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

function restartElements() {
  state.selectedPrograms = [];
  state.memoryState = [1048576, 15728640];
  state.process = [];
  state.segmentBits = 0;
  state.offset = 0;
  state.staticPartitionMB = 0;
}

function calcBases(partitionSizesMB) {
  const bases = [];
  let sum = 1048576;
  for (let i = 0; i < partitionSizesMB.length; i += 1) {
    bases[i] = sum;
    sum += partitionSizesMB[i] * MB;
  }
  return bases;
}

function initVariableProcesses() {
  if (state.process.length > 0) return;
  const partitionSizes = [0.5, 0.5, 1, 1, 2, 2, 4, 4];
  const bases = calcBases(partitionSizes);
  state.process = bases.map((base, index) => createFreeProcess(index, base, partitionSizes[index] * MB));
}

function initStaticProcesses() {
  if (!state.staticPartitionMB || state.process.length > 0) return;
  const repeats = Math.floor(15 / state.staticPartitionMB);
  const partitionSizes = Array(repeats).fill(state.staticPartitionMB);
  const bases = calcBases(partitionSizes);
  state.process = bases.map((base, index) => createFreeProcess(index, base, partitionSizes[index] * MB));
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

  state.currentRoute = routeDef || normalizedRoute === "/form" ? normalizedRoute : "/form";
  state.isFormOpen = state.currentRoute === "/form";

  if (!state.isFormOpen) {
    restartElements();
    if (
      routeDef?.implemented &&
      (state.currentRoute.startsWith("/variable") ||
        state.currentRoute.startsWith("/dinamico-sin-compactacion") ||
        state.currentRoute === "/dinamico-con-compactacion")
    ) {
      initVariableProcesses();
    }
  }

  renderAll();
}

function deleteSelectedProgram(programToDelete) {
  state.selectedPrograms = state.selectedPrograms.filter((program) => program.id !== programToDelete.id);
}

function assignLastSelectedProgram() {
  const def = getRouteDefinition(state.currentRoute);
  if (!def?.implemented) return;

  if (state.currentRoute === "/static") initStaticProcesses();
  if (
    state.currentRoute.startsWith("/variable") ||
    state.currentRoute.startsWith("/dinamico-sin-compactacion") ||
    state.currentRoute === "/dinamico-con-compactacion"
  ) {
    initVariableProcesses();
  }

  const { fn } = getCurrentAlgorithm();
  const lastProgram = state.selectedPrograms[state.selectedPrograms.length - 1];
  const existence = state.process.some((process) => process.id === lastProgram?.id);

  const heap = 131072;
  const stack = 65536;

  if (!lastProgram || existence) return;

  const memoryProcess = Number(lastProgram.txt) + Number(lastProgram.data) + Number(lastProgram.bss) + heap + stack;
  const index = fn(state.process, memoryProcess);

  if (index === -1) {
    deleteSelectedProgram(lastProgram);
    alert("No hay suficiente memoria");
    return;
  }

  const target = state.process[index];
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
    partitionBytes: target.partitionBytes,
  });

  state.process = [...state.process.slice(0, index), newProcess, ...state.process.slice(index + 1)];
}

function deleteProcessById(id) {
  const index = state.process.findIndex((process) => process.id === id);
  if (index === -1) return;

  const current = state.process[index];
  const free = createFreeProcess(index, current.base, current.partitionBytes);

  state.process = [...state.process.slice(0, index), free, ...state.process.slice(index + 1)];
  deleteSelectedProgram(current);

  if (state.currentRoute === "/dinamico-con-compactacion") {
    compactMemory();
  }

  renderBoard();
}

function compactMemory() {
  const occupied = state.process.filter((process) => process.id !== 0);
  const free = state.process.filter((process) => process.id === 0);

  const compacted = [...occupied, ...free].map((process, index) => {
    const slot = state.process[index];

    if (process.id === 0) {
      return createFreeProcess(index, slot.base, slot.partitionBytes);
    }

    return {
      ...process,
      base: slot.base,
      partitionBytes: slot.partitionBytes,
    };
  });

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
  return Number(value).toString(16);
}

function renderTable(processes, modeName) {
  const rows = processes
    .map((process, rowIndex) => {
      const pid = process.id === 0 ? 0 : `P${process.id}`;
      const color = rowIndex % 2 === 0 ? "#DBE2EF" : "#F9F7F7";
      return `
        <tr style="background-color:${color}">
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
            <td>1048576</td>
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
      const totalHeight = (process.partitionBytes * 37) / MB;

      if (process.id === 0) {
        return `<div class="partition" style="background-color:#205295;height:${totalHeight}px"></div>`;
      }

      const remaining = Math.max(0, process.partitionBytes - process.memory);
      const remainingHeight = (remaining * 37) / MB;
      const usedHeight = (process.memory * 37) / MB;

      return `
        <div class="container_partition" style="width:100%">
          <div class="partition" style="background-color:#205295;height:${remainingHeight}px"></div>
          <div class="partition" style="background-color:#8b0000;height:${usedHeight}px">
            <div class="position">${formatHex(process.base)} - ${formatHex(process.base + process.memory)}</div>
            <button data-delete-id="${process.id}">${process.name}</button>
          </div>
        </div>`;
    })
    .join("");

  return `
    <div id="memoria">
      ${stack}
      <div class="partition" style="background-color:#00913F;height:37px"><p>Sistema Operativo</p></div>
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
  const buttons = state.programs
    .map(
      (program) => `
      <div class="buttonContainer">
        <button class="botonesP" data-pick-key="${program.key}">${program.name}</button>
        <span class="info" title="Txt: ${program.txt} | Data: ${program.data} | Bss: ${program.bss}">ⓘ</span>
      </div>`,
    )
    .join("");

  const empty =
    state.programs.length === 0
      ? '<p style="color:white;text-align:center;width:100%;padding:12px">No hay programas cargados</p>'
      : "";

  ui.programContainer.innerHTML = `
    <h1>Programas</h1>
    <div class="programs">
      <div class="botonesProgramas">${buttons}${empty}</div>
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

  if (state.currentRoute === "/static") initStaticProcesses();
  if (
    state.currentRoute.startsWith("/variable") ||
    state.currentRoute.startsWith("/dinamico-sin-compactacion") ||
    state.currentRoute === "/dinamico-con-compactacion"
  ) {
    initVariableProcesses();
  }

  const mode = getCurrentAlgorithm();
  ui.board.innerHTML = `${renderTable(state.process, mode.name)}${renderStack(state.process)}`;
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

  document.addEventListener("submit", (event) => {
    if (event.target.id === "programForm") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const program = {
        key: randomId(),
        id: 0,
        name: formData.get("nombre"),
        txt: Number(formData.get("dato1")),
        data: Number(formData.get("dato2")),
        bss: Number(formData.get("dato3")),
      };

      state.programs = [...state.programs, program];
      event.target.reset();
      renderProgramContainer();
      return;
    }

    if (event.target.id === "staticConfigForm") {
      event.preventDefault();
      const value = Number(document.getElementById("partitionMb").value);
      if (!value || value <= 0 || value > 15) {
        alert("Ingrese un tamaño de partición válido entre 1 y 15 MB");
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
        if (Array.isArray(programs) && programs.length > 0) {
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
