const LOGICAL_BITS = 32;
const TOTAL_LOGICAL_BYTES = 2 ** LOGICAL_BITS;
const DEFAULT_SEGMENTS = [
  { name: "Código", size: 524288, baseFrame: 2048, maxOffset: 524287 },
  { name: "Datos", size: 262144, baseFrame: 2560, maxOffset: 262143 },
  { name: "BSS", size: 131072, baseFrame: 3072, maxOffset: 131071 },
  { name: "Heap", size: 1048576, baseFrame: 3584, maxOffset: 1048575 },
  { name: "Stack", size: 524288, baseFrame: 4608, maxOffset: 524287 },
];

const DEFAULT_PROCESSES = [
  { key: 1, id: 0, name: "NotePad", txt: 195240, data: 12352, bss: 1165, heap: 131072, stack: 65536 },
  { key: 2, id: 0, name: "Word", txt: 775390, data: 32680, bss: 4100, heap: 262144, stack: 65536 },
  { key: 3, id: 0, name: "Excel", txt: 995420, data: 24245, bss: 7557, heap: 524288, stack: 65536 },
  { key: 4, id: 0, name: "AutoCad", txt: 1150000, data: 123470, bss: 1123, heap: 1048576, stack: 131072 },
  { key: 5, id: 0, name: "Calculadora", txt: 123420, data: 1246, bss: 1756, heap: 131072, stack: 32768 },
];

const PROGRAM_STORAGE_KEY = "sistemas-operativos-proyecto-final-programas";

const state = {
  pageSize: 4096,
  programs: structuredClone(DEFAULT_PROCESSES),
  selectedProgramIndex: 0,
  segments: structuredClone(DEFAULT_SEGMENTS),
  selectedSegmentIndex: 0,
};

const elements = {
  pageSize: document.getElementById("pageSize"),
  segmentSelect: document.getElementById("segmentSelect"),
  offsetInput: document.getElementById("offsetInput"),
  frameBaseInput: document.getElementById("frameBaseInput"),
  segmentInputs: document.getElementById("segmentInputs"),
  processCatalog: document.getElementById("processCatalog"),
  processForm: document.getElementById("processForm"),
  processMemoryMap: document.getElementById("processMemoryMap"),
  processSummary: document.getElementById("processSummary"),
  saveProgramsBtn: document.getElementById("saveProgramsBtn"),
  exportProgramsBtn: document.getElementById("exportProgramsBtn"),
  restoreProgramsBtn: document.getElementById("restoreProgramsBtn"),
  translateBtn: document.getElementById("translateBtn"),
  randomBtn: document.getElementById("randomBtn"),
  resetBtn: document.getElementById("resetBtn"),
  logicalAddress: document.getElementById("logicalAddress"),
  logicalBits: document.getElementById("logicalBits"),
  segmentResult: document.getElementById("segmentResult"),
  segmentRange: document.getElementById("segmentRange"),
  pageResult: document.getElementById("pageResult"),
  offsetResult: document.getElementById("offsetResult"),
  physicalAddress: document.getElementById("physicalAddress"),
  frameResult: document.getElementById("frameResult"),
  messageBox: document.getElementById("messageBox"),
  segmentTableBody: document.getElementById("segmentTableBody"),
  pageMap: document.getElementById("pageMap"),
  explanationText: document.getElementById("explanationText"),
};

function formatBytes(value) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KiB`;
  return `${value} B`;
}

function formatBinary(value, bits = LOGICAL_BITS) {
  return `0b${value.toString(2).padStart(bits, "0")}`;
}

function formatHex(value, width = 8) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function pageOffsetBits(pageSize) {
  return Math.round(Math.log2(pageSize));
}

function segmentBits() {
  return 3;
}

function pageBits(pageSize) {
  return LOGICAL_BITS - segmentBits() - pageOffsetBits(pageSize);
}

function createSegmentInputs() {
  elements.segmentInputs.innerHTML = "";

  state.segments.forEach((segment, index) => {
    const row = document.createElement("article");
    row.className = "segment-row";
    row.innerHTML = `
      <div>
        <header>
          <h4>${segment.name}</h4>
          <span class="hint">S${index}</span>
        </header>
        <label class="field">
          <span>Tamaño del segmento</span>
          <input type="number" min="1" step="1" value="${segment.size}" data-segment-size="${index}" />
        </label>
      </div>
      <div>
        <label class="field">
          <span>Marco físico base</span>
          <input type="number" min="0" step="1" value="${segment.baseFrame}" data-segment-frame="${index}" />
        </label>
      </div>
    `;
    elements.segmentInputs.appendChild(row);
  });
}

function processMemorySize(program) {
  return Number(program.txt) + Number(program.data) + Number(program.bss) + Number(program.heap) + Number(program.stack);
}

function normalizeProgram(program, index = 0) {
  return {
    key: Number(program.key) || index + 1,
    id: 0,
    name: String(program.name || `Proceso ${index + 1}`),
    txt: Math.max(1, Number(program.txt || 1)),
    data: Math.max(0, Number(program.data || 0)),
    bss: Math.max(0, Number(program.bss || 0)),
    heap: Math.max(1, Number(program.heap || 131072)),
    stack: Math.max(1, Number(program.stack || 65536)),
  };
}

function nextProgramKey() {
  return state.programs.reduce((maxKey, program) => Math.max(maxKey, Number(program.key) || 0), 0) + 1;
}

function readStoredPrograms() {
  try {
    const raw = localStorage.getItem(PROGRAM_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.map((program, index) => normalizeProgram(program, index));
  } catch (_) {
    return null;
  }
}

function saveProgramsToStorage(programs) {
  try {
    localStorage.setItem(PROGRAM_STORAGE_KEY, JSON.stringify(programs));
    return true;
  } catch (_) {
    return false;
  }
}

function downloadProgramsJson(programs) {
  const blob = new Blob([JSON.stringify(programs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "programas.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildSegmentsFromProgram(program) {
  return [
    { name: "Código", size: Math.max(1, Number(program.txt || 1)), baseFrame: 2048, maxOffset: Math.max(1, Number(program.txt || 1)) - 1 },
    { name: "Datos", size: Math.max(1, Number(program.data || 1)), baseFrame: 2560, maxOffset: Math.max(1, Number(program.data || 1)) - 1 },
    { name: "BSS", size: Math.max(1, Number(program.bss || 1)), baseFrame: 3072, maxOffset: Math.max(1, Number(program.bss || 1)) - 1 },
    { name: "Heap", size: Math.max(1, Number(program.heap || 1)), baseFrame: 3584, maxOffset: Math.max(1, Number(program.heap || 1)) - 1 },
    { name: "Stack", size: Math.max(1, Number(program.stack || 1)), baseFrame: 4608, maxOffset: Math.max(1, Number(program.stack || 1)) - 1 },
  ];
}

function renderProcessSummary() {
  const program = state.programs[state.selectedProgramIndex];
  const totalBytes = state.segments.reduce((sum, segment) => sum + segment.size, 0);

  elements.processSummary.innerHTML = `
    <strong>Proceso activo: ${program.name}</strong><br />
    Segmentos: ${state.segments.length} · Huella lógica aproximada: ${formatBytes(totalBytes)}<br />
    Tamaño total del proceso: ${formatBytes(processMemorySize(program))}
  `;
}

function renderProcessMemoryMap() {
  if (!elements.processMemoryMap) return;

  const program = state.programs[state.selectedProgramIndex];
  const cards = state.segments.map((segment, index) => {
    const pages = getSegmentPageCount(segment);
    const logicalBase = getSegmentLogicalBase(index);
    const logicalLimit = logicalBase + segment.size - 1;
    const usedBytes = pages * state.pageSize;
    const occupancy = Math.min(100, (segment.size / usedBytes) * 100);
    const pagePreviewLimit = 6;
    const pagePreview = Array.from({ length: Math.min(pages, pagePreviewLimit) }, (_, page) => {
      const frame = segment.baseFrame + page;
      return `<span class="memory-pill">P${page} → M${frame}</span>`;
    }).join("");
    const remainingPages = pages - pagePreviewLimit;

    return `
      <article class="memory-segment-card">
        <div class="memory-segment-head">
          <div>
            <strong>${segment.name}</strong>
            <span>${formatBytes(segment.size)} · ${pages} páginas</span>
          </div>
          <small>${formatHex(logicalBase)} - ${formatHex(logicalLimit)}</small>
        </div>
        <div class="memory-fill" aria-hidden="true">
          <span style="width:${occupancy.toFixed(2)}%"></span>
        </div>
        <div class="memory-segment-meta">
          <span>Marco base ${segment.baseFrame}</span>
          <span>Marco final ${segment.baseFrame + pages - 1}</span>
        </div>
        <div class="memory-pills">
          ${pagePreview}
          ${remainingPages > 0 ? `<span class="memory-pill memory-pill--more">+${remainingPages} páginas</span>` : ""}
        </div>
      </article>
    `;
  }).join("");

  elements.processMemoryMap.innerHTML = cards || `<div class="empty">No hay segmentos para mostrar en ${program.name}.</div>`;
}

function renderProcessCatalog() {
  if (!elements.processCatalog) return;

  const cards = state.programs.map((program, index) => {
    const isActive = index === state.selectedProgramIndex ? "process-card--active" : "";
    return `
      <article class="process-card ${isActive}" data-pick-key="${program.key}" tabindex="0" role="button" aria-label="Cargar ${program.name}">
        <div class="process-card-head">
          <button class="process-card-button" data-pick-key="${program.key}">${program.name}</button>
          <span class="process-card-size">${formatBytes(processMemorySize(program))}</span>
        </div>
        <div class="process-card-meta">
          <span><strong>.txt</strong> ${formatBytes(program.txt)}</span>
          <span><strong>.data</strong> ${formatBytes(program.data)}</span>
          <span><strong>.bss</strong> ${formatBytes(program.bss)}</span>
          <span><strong>heap</strong> ${formatBytes(program.heap)}</span>
          <span><strong>stack</strong> ${formatBytes(program.stack)}</span>
        </div>
      </article>`;
  }).join("");

  elements.processCatalog.innerHTML = cards;
}

function createSegmentOptions() {
  elements.segmentSelect.innerHTML = "";
  state.segments.forEach((segment, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${segment.name} (${formatBytes(segment.size)})`;
    elements.segmentSelect.appendChild(option);
  });
  elements.segmentSelect.value = String(state.selectedSegmentIndex);
}

function syncInputsFromState() {
  elements.pageSize.value = String(state.pageSize);
  elements.offsetInput.value = String(Math.min(Number(elements.offsetInput.value || 0), getSelectedSegment().size - 1));
  elements.frameBaseInput.value = String(getSelectedSegment().baseFrame);
}

function getSelectedSegment() {
  return state.segments[state.selectedSegmentIndex];
}

function updateSegmentFromInputs() {
  document.querySelectorAll("[data-segment-size]").forEach((input) => {
    const index = Number(input.dataset.segmentSize);
    state.segments[index].size = Math.max(1, Number(input.value || 1));
  });

  document.querySelectorAll("[data-segment-frame]").forEach((input) => {
    const index = Number(input.dataset.segmentFrame);
    state.segments[index].baseFrame = Math.max(0, Number(input.value || 0));
  });
}

function applyProcessProgram(programIndex) {
  const program = state.programs[programIndex];

  state.selectedProgramIndex = programIndex;
  state.segments = buildSegmentsFromProgram(program);
  state.selectedSegmentIndex = 0;

  createSegmentInputs();
  createSegmentOptions();
  syncInputsFromState();
  elements.offsetInput.value = String(Math.min(Number(elements.offsetInput.value || 1024), state.segments[0].size - 1));
  renderProcessCatalog();
  renderSegmentsTable();
  renderPageMap(0);
  renderProcessSummary();
  renderProcessMemoryMap();
  renderExplanation();
  renderTranslation();
}

function addProcessProfile(program) {
  const newProgram = { ...normalizeProgram(program, state.programs.length), key: nextProgramKey(), id: 0 };
  state.programs = [...state.programs, newProgram];
  saveProgramsToStorage(state.programs);
  return state.programs.length - 1;
}

async function loadPrograms() {
  const storedPrograms = readStoredPrograms();
  if (storedPrograms) {
    state.programs = storedPrograms;
    return;
  }

  const sources = ["./programas.json", "programas.json"];

  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) continue;

      const programs = await response.json();
      if (Array.isArray(programs) && programs.length > 0) {
        state.programs = programs.map((program, index) => normalizeProgram(program, index));
        saveProgramsToStorage(state.programs);
        return;
      }
    } catch (_) {
      continue;
    }
  }

  state.programs = structuredClone(DEFAULT_PROCESSES);
  saveProgramsToStorage(state.programs);
}

function getSegmentPageCount(segment) {
  return Math.ceil(segment.size / state.pageSize);
}

function getSegmentLogicalBase(segmentIndex) {
  return state.segments.slice(0, segmentIndex).reduce((sum, segment) => sum + segment.size, 0);
}

function createTranslation(segmentIndex, logicalOffset) {
  const segment = state.segments[segmentIndex];
  const pagesInSegment = getSegmentPageCount(segment);
  const pageIndex = Math.floor(logicalOffset / state.pageSize);
  const pageOffset = logicalOffset % state.pageSize;
  const frameNumber = segment.baseFrame + pageIndex;
  const physicalAddress = frameNumber * state.pageSize + pageOffset;
  const offsetBits = pageOffsetBits(state.pageSize);
  const logicalAddress = (segmentIndex * (2 ** (pageBits(state.pageSize) + offsetBits))) +
    (pageIndex * (2 ** offsetBits)) +
    pageOffset;

  return {
    segment,
    pagesInSegment,
    pageIndex,
    pageOffset,
    frameNumber,
    physicalAddress,
    logicalAddress,
  };
}

function renderSegmentsTable() {
  elements.segmentTableBody.innerHTML = "";
  let logicalCursor = 0;

  state.segments.forEach((segment, index) => {
    const pages = getSegmentPageCount(segment);
    const row = document.createElement("tr");
    const logicalBase = getSegmentLogicalBase(index);
    row.innerHTML = `
      <td>${segment.name}</td>
      <td>${formatBytes(segment.size)}</td>
      <td>${pages}</td>
      <td>${formatHex(logicalBase)}</td>
      <td>${formatHex(logicalBase + segment.size - 1)}</td>
      <td>${segment.baseFrame}</td>
    `;
    elements.segmentTableBody.appendChild(row);

    const option = elements.segmentSelect.querySelector(`option[value="${index}"]`);
    if (option) option.textContent = `${segment.name} (${formatBytes(segment.size)})`;
  });
}

function renderPageMap(segmentIndex) {
  const segment = state.segments[segmentIndex];
  const pageCount = getSegmentPageCount(segment);
  const activePage = Math.min(Math.floor(Number(elements.offsetInput.value || 0) / state.pageSize), Math.max(pageCount - 1, 0));
  const cards = [];

  for (let page = 0; page < pageCount; page += 1) {
    const frameNumber = segment.baseFrame + page;
    const logicalStart = page * state.pageSize;
    const logicalEnd = Math.min(logicalStart + state.pageSize - 1, segment.size - 1);
    const occupancy = page === pageCount - 1
      ? ((segment.size - logicalStart) / state.pageSize) * 100
      : 100;
    cards.push(`
      <article class="page-card ${page === activePage ? "page-card--active" : ""}">
        <div class="page-card-top">
          <span>Página ${page}</span>
          <strong>Marco ${frameNumber}</strong>
        </div>
        <div class="page-card-bar" aria-hidden="true">
          <span style="width:${occupancy.toFixed(2)}%"></span>
        </div>
        <small>
          Rango lógico: ${formatHex(logicalStart)} - ${formatHex(logicalEnd)}<br />
          Base física: ${formatHex(frameNumber * state.pageSize)}
        </small>
      </article>
    `);
  }

  elements.pageMap.innerHTML = cards.join("") || '<div class="empty">No hay páginas para mostrar.</div>';
}

function renderExplanation() {
  const offsetBits = pageOffsetBits(state.pageSize);
  const pageFieldBits = pageBits(state.pageSize);
  const segBits = segmentBits();
  const totalPages = TOTAL_LOGICAL_BYTES / state.pageSize;

  elements.explanationText.innerHTML = `
    <div>
      En un sistema con direccionamiento lógico de <strong>2<sup>32</sup> bytes</strong>, el espacio de direcciones alcanza ${formatBytes(TOTAL_LOGICAL_BYTES)}.
      La técnica de segmentación paginada organiza esa capacidad en una dirección lógica de ${LOGICAL_BITS} bits con tres campos claramente diferenciados:
    </div>
    <div class="formula">
      [ ${segBits} bits de segmento ] + [ ${pageFieldBits} bits de página ] + [ ${offsetBits} bits de desplazamiento ] = ${LOGICAL_BITS} bits
    </div>
    <div>
      El selector de segmento consume ${segBits} bits y permite identificar hasta ${2 ** segBits} segmentos independientes.
      Los bits restantes se asignan al número de página dentro del segmento y al desplazamiento interno de la página, cuyo tamaño depende de la política de paginación.
    </div>
    <div>
      Si el tamaño de página es ${formatBytes(state.pageSize)}, el desplazamiento ocupa ${offsetBits} bits y cada segmento queda dividido en páginas de ese tamaño.
      Durante la traducción, el hardware o el sistema operativo consulta la tabla asociada al segmento para obtener el marco físico correspondiente.
    </div>
    <div>
      En consecuencia, la traducción completa sigue esta secuencia: <strong>segmento → página → marco físico → dirección física</strong>.
      Con la configuración actual, el espacio lógico contiene hasta ${totalPages.toLocaleString("es-ES")} páginas potenciales.
    </div>
  `;
}

function setMessage(text, type = "") {
  elements.messageBox.className = `message-box ${type}`.trim();
  elements.messageBox.innerHTML = text;
}

function renderTranslation() {
  const segmentIndex = Number(elements.segmentSelect.value);
  state.selectedSegmentIndex = segmentIndex;
  updateSegmentFromInputs();

  const segment = state.segments[segmentIndex];
  const logicalOffset = Number(elements.offsetInput.value || 0);
  const pageCount = getSegmentPageCount(segment);

  if (logicalOffset < 0 || logicalOffset >= segment.size) {
    setMessage(
      `El desplazamiento ingresado excede el límite del segmento <strong>${segment.name}</strong>. Su rango válido es de <strong>0</strong> a <strong>${segment.size - 1}</strong>.`,
      "error",
    );
    return;
  }

  const translation = createTranslation(segmentIndex, logicalOffset);
  const segmentBitsValue = segmentIndex.toString(2).padStart(segmentBits(), "0");
  const pageBitsValue = translation.pageIndex.toString(2).padStart(pageBits(state.pageSize), "0");
  const offsetBitsValue = translation.pageOffset.toString(2).padStart(pageOffsetBits(state.pageSize), "0");
  const logicalBase = getSegmentLogicalBase(segmentIndex);

  elements.logicalAddress.textContent = formatHex(translation.logicalAddress);
  elements.logicalBits.textContent = `${formatBinary(translation.logicalAddress)} · S${segmentBitsValue} | P${pageBitsValue} | O${offsetBitsValue}`;
  elements.segmentResult.textContent = `${segment.name} (${segmentIndex})`;
  elements.segmentRange.textContent = `Base lógica ${formatHex(logicalBase)} · límite ${formatHex(logicalBase + segment.size - 1)} · ${pageCount} páginas`;
  elements.pageResult.textContent = `Página ${translation.pageIndex}`;
  elements.offsetResult.textContent = `Offset ${translation.pageOffset} bytes dentro de la página`;
  elements.physicalAddress.textContent = formatHex(translation.physicalAddress);
  elements.frameResult.textContent = `Marco ${translation.frameNumber} · base física ${formatHex(translation.frameNumber * state.pageSize)}`;

  setMessage(
    `La dirección lógica se descompuso en segmento, página y desplazamiento. El segmento <strong>${segment.name}</strong> apunta al marco <strong>${translation.frameNumber}</strong>, y la dirección física final es <strong>${formatHex(translation.physicalAddress)}</strong>.`,
    "success",
  );

  renderPageMap(segmentIndex);
  renderProcessMemoryMap();
  renderExplanation();
}

function resetExample() {
  state.pageSize = 4096;
  state.selectedProgramIndex = 0;
  applyProcessProgram(0);
  state.selectedSegmentIndex = 0;
  elements.pageSize.value = "4096";
  elements.segmentSelect.value = "0";
  elements.offsetInput.value = "1024";
  elements.frameBaseInput.value = String(state.segments[0].baseFrame);
  renderProcessSummary();
  renderProcessMemoryMap();
}

function randomExample() {
  const pageSizes = [4096, 8192, 16384];
  state.pageSize = pageSizes[Math.floor(Math.random() * pageSizes.length)];
  elements.pageSize.value = String(state.pageSize);

  state.selectedSegmentIndex = Math.floor(Math.random() * state.segments.length);
  elements.segmentSelect.value = String(state.selectedSegmentIndex);

  const selected = getSelectedSegment();
  const maxOffset = Math.max(selected.size - 1, 0);
  const pageIndex = Math.floor(Math.random() * Math.max(getSegmentPageCount(selected), 1));
  const randomOffset = Math.min(pageIndex * state.pageSize + Math.floor(Math.random() * state.pageSize), maxOffset);
  elements.offsetInput.value = String(randomOffset);
  elements.frameBaseInput.value = String(selected.baseFrame);

  renderSegmentsTable();
  renderPageMap(state.selectedSegmentIndex);
  renderProcessMemoryMap();
  renderTranslation();
}

function bootstrap() {
  renderProcessCatalog();
  createSegmentInputs();
  createSegmentOptions();
  renderSegmentsTable();
  renderProcessSummary();
  renderProcessMemoryMap();
  renderExplanation();
  renderPageMap(0);
  renderTranslation();

  elements.processCatalog?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-pick-key]");
    if (!card) return;
    const program = state.programs.find((item) => String(item.key) === card.getAttribute("data-pick-key"));
    if (!program) return;
    applyProcessProgram(state.programs.findIndex((item) => item.key === program.key));
  });

  elements.processCatalog?.addEventListener("keydown", (event) => {
    const card = event.target.closest(".process-card");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const program = state.programs.find((item) => String(item.key) === card.getAttribute("data-pick-key"));
    if (!program) return;
    applyProcessProgram(state.programs.findIndex((item) => item.key === program.key));
  });

  elements.processForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const program = {
      name: String(formData.get("name") || "Nuevo proceso"),
      txt: Number(formData.get("txt") || 1),
      data: Number(formData.get("data") || 1),
      bss: Number(formData.get("bss") || 1),
      heap: Number(formData.get("heap") || 131072),
      stack: Number(formData.get("stack") || 65536),
    };

    if (program.txt <= 0 || program.data < 0 || program.bss < 0 || program.heap <= 0 || program.stack <= 0) {
      setMessage("Los tamaños del proceso deben ser válidos y mayores que cero en txt, heap y stack.", "error");
      return;
    }

    const newIndex = addProcessProfile(program);
    event.target.reset();
    applyProcessProgram(newIndex);
    setMessage(
      `El proceso <strong>${program.name}</strong> se guardó en el catálogo local del navegador. Usa <strong>Descargar JSON</strong> si quieres generar el archivo actualizado.`,
      "success",
    );
  });

  elements.saveProgramsBtn?.addEventListener("click", () => {
    const saved = saveProgramsToStorage(state.programs);
    setMessage(
      saved
        ? "El catálogo de procesos quedó guardado en el navegador."
        : "No se pudo guardar en el navegador por una limitación del entorno.",
      saved ? "success" : "error",
    );
  });

  elements.exportProgramsBtn?.addEventListener("click", () => {
    downloadProgramsJson(state.programs);
    setMessage("Se generó una descarga con el catálogo actual en formato JSON.", "success");
  });

  elements.restoreProgramsBtn?.addEventListener("click", async () => {
    localStorage.removeItem(PROGRAM_STORAGE_KEY);
    await loadPrograms();
    applyProcessProgram(0);
    setMessage("Se restauró el catálogo base desde programas.json.", "success");
  });

  elements.pageSize.addEventListener("change", () => {
    state.pageSize = Number(elements.pageSize.value);
    const selected = getSelectedSegment();
    elements.offsetInput.value = String(Math.min(Number(elements.offsetInput.value || 0), selected.size - 1));
    renderTranslation();
  });

  elements.segmentSelect.addEventListener("change", () => {
    state.selectedSegmentIndex = Number(elements.segmentSelect.value);
    const selected = getSelectedSegment();
    elements.offsetInput.value = String(Math.min(Number(elements.offsetInput.value || 0), selected.size - 1));
    elements.frameBaseInput.value = String(selected.baseFrame);
    renderPageMap(state.selectedSegmentIndex);
    renderTranslation();
  });

  elements.offsetInput.addEventListener("input", renderTranslation);
  elements.frameBaseInput.addEventListener("input", () => {
    getSelectedSegment().baseFrame = Math.max(0, Number(elements.frameBaseInput.value || 0));
    renderPageMap(state.selectedSegmentIndex);
    renderTranslation();
  });

  elements.segmentInputs.addEventListener("input", () => {
    updateSegmentFromInputs();
    createSegmentOptions();
    renderSegmentsTable();
    renderPageMap(state.selectedSegmentIndex);
    renderProcessMemoryMap();
    renderTranslation();
  });

  elements.translateBtn.addEventListener("click", renderTranslation);
  elements.randomBtn.addEventListener("click", randomExample);
  elements.resetBtn.addEventListener("click", resetExample);
}

async function init() {
  await loadPrograms();
  renderProcessCatalog();
  applyProcessProgram(0);
  bootstrap();
}

init();