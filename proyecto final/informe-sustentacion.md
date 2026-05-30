# Informe tecnico de defensa del proyecto final

## 1. Proposito del proyecto

Este proyecto es un simulador web de **segmentacion paginada** para una direccion logica de **32 bits**. Su objetivo no es implementar un sistema operativo real, sino **visualizar y explicar** como se puede dividir una direccion logica en tres partes:

1. **Segmento**
2. **Pagina**
3. **Desplazamiento dentro de la pagina**

La idea central es que una direccion logica se convierte en una direccion fisica siguiendo la ruta:

```text
segmento -> pagina -> marco fisico -> direccion fisica
```

El proyecto esta pensado para sustentacion porque permite responder preguntas conceptuales y tambien preguntas de codigo, por ejemplo:

- donde se define el tamano de pagina;
- donde se calcula la direccion fisica;
- donde se valida que un offset no exceda el tamano del segmento;
- donde se actualiza la tabla de segmentos;
- donde se pinta el mapa de paginas;
- donde se maneja el boton de ejemplo aleatorio.

---

## 2. Estructura general del proyecto

El proyecto final esta compuesto por tres archivos principales:

- [index.html](index.html): define la interfaz y los puntos donde se imprime la informacion.
- [styles.css](styles.css): define la presentacion visual, el layout responsivo y el estilo de los resultados.
- [app.js](app.js): contiene toda la logica de simulacion, calculo, validacion y renderizado dinamico.

En terminos arquitectonicos, se trata de una **Single Page Application** muy simple:

- el HTML crea la estructura;
- el CSS organiza la presentacion;
- el JavaScript toma decisiones, actualiza el estado y reescribe partes del DOM segun la entrada del usuario.

---

## 3. Idea teorica que implementa el simulador

La segmentacion paginada combina dos tecnicas:

- **Segmentacion**: divide el espacio logico en unidades semanticas, como codigo, datos, heap o stack.
- **Paginacion**: divide cada segmento en bloques del mismo tamano, llamados paginas, que luego se asignan a marcos fisicos.

En este proyecto:

- el espacio logico total es de **2^32 bytes**;
- se reservan **3 bits** para identificar el segmento, lo que permite hasta 8 segmentos teoricos;
- el resto de la direccion se divide entre numero de pagina y desplazamiento;
- el tamano de pagina es configurable y debe ser una potencia de 2.

Esto permite mostrar que una direccion logica no se traduce directamente a una fisica, sino que pasa por una estructura intermedia.

---

## 4. Mapa de archivos y responsabilidades

### 4.1 `index.html`

El HTML define tres zonas funcionales:

- un bloque superior con contexto teorico y estadisticas;
- un panel de configuracion con controles de entrada;
- un panel de resultados con tabla, mapa de paginas y explicacion final.

La estructura relevante es esta:

```html
<main class="shell">
  <section class="hero">
    ...
  </section>

  <section class="content">
    <div class="panel controls">...</div>
    <div class="panel results">...</div>
  </section>

  <section class="panel explanation">...</section>
</main>
```

#### Que hay que defender en el HTML

- Los `id` no estan puestos al azar: son los puntos que `app.js` usa para leer y escribir valores.
- La parte de resultados tiene elementos vacios con `id` porque el contenido se genera dinamicamente.
- El script se carga con `defer`, lo que permite que el DOM ya exista cuando JavaScript ejecuta `bootstrap()`.

### 4.2 `styles.css`

El CSS no solo embellece: tambien ayuda a organizar la lectura del simulador.

Puntos importantes:

- define variables globales en `:root` para colores, sombras, radios y fuentes;
- usa una paleta oscura con acentos celestes y dorados para darle identidad visual;
- organiza el contenido con `grid`;
- agrega comportamiento responsivo con `@media`;
- diferencia visualmente resultados correctos, errores y estados activos.

### 4.3 `app.js`

Este archivo contiene toda la logica importante. En una sustentacion, es el archivo que mas conviene mostrar porque ahi estan:

- las constantes del modelo;
- el estado de la simulacion;
- la construccion de inputs dinamicos;
- la conversion de direccion logica a fisica;
- la validacion de rango;
- la generacion de tablas y mapas;
- el manejo de eventos.

---

## 5. Variables principales del modelo

La primera parte de `app.js` define las constantes que fijan el escenario del simulador:

```js
const LOGICAL_BITS = 32;
const TOTAL_LOGICAL_BYTES = 2 ** LOGICAL_BITS;
const DEFAULT_SEGMENTS = [
  { name: "Codigo", size: 524288, baseFrame: 2048, maxOffset: 524287 },
  { name: "Datos", size: 262144, baseFrame: 2560, maxOffset: 262143 },
  { name: "BSS", size: 131072, baseFrame: 3072, maxOffset: 131071 },
  { name: "Heap", size: 1048576, baseFrame: 3584, maxOffset: 1048575 },
  { name: "Stack", size: 524288, baseFrame: 4608, maxOffset: 524287 },
];
```

### Como defender estas constantes

- `LOGICAL_BITS = 32` fija el tamano teorico de la direccion logica.
- `TOTAL_LOGICAL_BYTES = 2 ** 32` representa 4 GiB de espacio direccionable.
- `DEFAULT_SEGMENTS` crea un ejemplo base con segmentos clasicos de un proceso.

#### Observacion importante para la sustentacion

Aunque el selector de segmento usa **3 bits** y por tanto podria representar hasta 8 segmentos, la configuracion inicial solo crea 5 segmentos nombrados. Eso no es un error: significa que el modelo teorico permite 8, pero el ejemplo base usa menos.

El estado central del simulador es este:

```js
const state = {
  pageSize: 4096,
  segments: structuredClone(DEFAULT_SEGMENTS),
  selectedSegmentIndex: 0,
};
```

### Por que se usa `structuredClone`

Se usa para copiar los segmentos por valor, no por referencia. Si se modificara directamente `DEFAULT_SEGMENTS`, el ejemplo base quedaria contaminado. Esto permite resetear el simulador sin efectos secundarios.

---

## 6. Captura de elementos del DOM

Antes de hacer cualquier calculo, el codigo enlaza los elementos del HTML con el script:

```js
const elements = {
  pageSize: document.getElementById("pageSize"),
  segmentSelect: document.getElementById("segmentSelect"),
  offsetInput: document.getElementById("offsetInput"),
  frameBaseInput: document.getElementById("frameBaseInput"),
  segmentInputs: document.getElementById("segmentInputs"),
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
```

### Que conviene explicar aqui

Esto evita buscar elementos varias veces y hace el codigo mas ordenado. Tambien deja claro que el proyecto trabaja de forma reactiva: el usuario cambia valores, el estado cambia y despues el DOM se vuelve a pintar.

---

## 7. Funciones auxiliares de formato

El proyecto no muestra solo numeros crudos. Tambien formatea bytes, binario y hexadecimal para que la sustentacion sea mas didactica.

```js
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
```

### Pregunta tipica del profesor

**Por que mostrar hexadecimal y binario?**

Porque en sistemas operativos las direcciones se interpretan normalmente en una forma binaria a nivel de bits, pero hexadecimal facilita la lectura humana y se usa mucho al trabajar con memoria.

---

## 8. Cálculo de bits del modelo

Estas funciones determinan como se parte la direccion:

```js
function pageOffsetBits(pageSize) {
  return Math.round(Math.log2(pageSize));
}

function segmentBits() {
  return 3;
}

function pageBits(pageSize) {
  return LOGICAL_BITS - segmentBits() - pageOffsetBits(pageSize);
}
```

### Interpretacion tecnica

- `pageOffsetBits(pageSize)` calcula cuantos bits necesita el desplazamiento dentro de una pagina.
- `segmentBits()` fija el numero de bits del selector de segmento.
- `pageBits(pageSize)` obtiene los bits disponibles para identificar la pagina dentro del segmento.

### Como defender `Math.log2`

La logica de bits solo tiene sentido cuando el tamano de pagina es potencia de 2. Por eso las opciones del selector son 4096, 8192 y 16384 bytes.

#### Ejemplo rapido

Si el tamano de pagina es 4096 bytes:

- `log2(4096) = 12`, entonces el offset ocupa 12 bits;
- `pageBits = 32 - 3 - 12 = 17` bits;
- la direccion se divide en 3 + 17 + 12 bits.

---

## 9. Generacion dinamica de segmentos

El formulario de segmentos no esta escrito a mano en HTML, sino que se genera desde JavaScript:

```js
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
          <span>Tamano del segmento</span>
          <input type="number" min="1" step="1" value="${segment.size}" data-segment-size="${index}" />
        </label>
      </div>
      <div>
        <label class="field">
          <span>Marco fisico base</span>
          <input type="number" min="0" step="1" value="${segment.baseFrame}" data-segment-frame="${index}" />
        </label>
      </div>
    `;
    elements.segmentInputs.appendChild(row);
  });
}
```

### Que hace exactamente

Cada segmento se muestra con:

- nombre;
- indice `S0`, `S1`, etc.;
- tamano editable;
- marco fisico base editable.

### Puntos importantes para defensa

- Los atributos `data-segment-size` y `data-segment-frame` permiten identificar que input corresponde a cada segmento.
- Al ser dinamico, cualquier cambio del usuario se refleja inmediatamente en la simulacion.

---

## 10. Opciones del selector de segmentos

El selector de segmento tambien se construye por codigo:

```js
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
```

### Por que es importante

Esto hace que el usuario pueda cambiar de segmento y ver inmediatamente su tamano actual. Como el tamano puede editarse, el texto del selector tambien debe actualizarse.

---

## 11. Lectura y escritura del estado

Hay funciones para sincronizar la interfaz con el estado y para extraer los valores editables.

### 11.1 `getSelectedSegment`

```js
function getSelectedSegment() {
  return state.segments[state.selectedSegmentIndex];
}
```

Es una funcion pequena, pero muy importante: centraliza la manera en que se obtiene el segmento activo.

### 11.2 `updateSegmentFromInputs`

```js
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
```

### Como defender esta funcion

- Recoge los cambios de la UI y los lleva al modelo de datos.
- Usa `Math.max` para evitar valores invalidos como tamanos negativos o marcos negativos.
- Permite que la tabla, el mapa y el resultado trabajen con el mismo estado real.

---

## 12. Cálculo del numero de paginas por segmento

Cada segmento se divide en paginas segun el tamano elegido:

```js
function getSegmentPageCount(segment) {
  return Math.ceil(segment.size / state.pageSize);
}
```

### Por que se usa `Math.ceil`

Porque el ultimo bloque puede quedar incompleto. Si un segmento mide 5000 bytes y la pagina es de 4096, no alcanza con una pagina; se necesitan 2 aunque la segunda quede parcialmente llena.

---

## 13. Base logica de cada segmento

El proyecto calcula la direccion base logica de cada segmento sumando los tamanos de los segmentos anteriores:

```js
function getSegmentLogicalBase(segmentIndex) {
  return state.segments.slice(0, segmentIndex).reduce((sum, segment) => sum + segment.size, 0);
}
```

### Que significa esto

Si el segmento `Datos` esta despues de `Codigo`, su base logica es la suma de todos los bytes ocupados por los segmentos anteriores. Eso permite mostrar un rango logico continuo en la tabla.

### Pregunta dificil posible

**Esto es una tabla de segmentos real o una representacion didactica?**

Es una representacion didactica. El proyecto no implementa una tabla hardware real ni un sistema operativo completo; simula como se puede estructurar la direccion para aprender el principio.

---

## 14. Funcion central: traduccion de direccion

La funcion mas importante del proyecto es `createTranslation`. Aqui ocurre el calculo que el profesor probablemente va a pedir que se ubiquen en el codigo.

```js
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
```

### Desglose paso a paso

#### 1. `pageIndex`

```js
const pageIndex = Math.floor(logicalOffset / state.pageSize);
```

Divide el offset logico entre el tamano de pagina para saber en que pagina del segmento cae la direccion.

#### 2. `pageOffset`

```js
const pageOffset = logicalOffset % state.pageSize;
```

Obtiene la posicion exacta dentro de la pagina.

#### 3. `frameNumber`

```js
const frameNumber = segment.baseFrame + pageIndex;
```

El marco fisico se obtiene sumando el marco base del segmento mas el indice de pagina.

#### 4. `physicalAddress`

```js
const physicalAddress = frameNumber * state.pageSize + pageOffset;
```

Aqui se genera la direccion fisica final. La formula toma la base del marco y le suma el desplazamiento interno.

#### 5. `logicalAddress`

```js
const logicalAddress = (segmentIndex * (2 ** (pageBits(state.pageSize) + offsetBits))) +
  (pageIndex * (2 ** offsetBits)) +
  pageOffset;
```

Esta expresion reconstruye una direccion logica compuesta por campos.

### Como explicarlo en sustentacion

La direccion logica no se trata como un numero unico sin estructura. El simulador la construye como si estuviera formada por tres campos binarios:

- bits del segmento;
- bits de la pagina;
- bits del desplazamiento.

Por eso la salida puede mostrar tambien la separacion en binario.

---

## 15. Tabla de segmentos

La tabla resume el modelo de memoria activo:

```js
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
```

### Que muestra esta tabla

- nombre del segmento;
- tamano;
- cantidad de paginas;
- base logica;
- limite logico;
- marco base.

### Pregunta probable

**Por que el limite se calcula con `base + size - 1`?**

Porque el primer byte del segmento es la base y el ultimo byte util es la base mas el tamano menos uno.

### Observacion tecnica

La variable `logicalCursor` existe pero no se usa en la version actual. No afecta el funcionamiento, pero se podria eliminar si se quisiera limpiar el codigo.

---

## 16. Mapa visual de paginas

Este bloque hace la parte mas pedagogica del proyecto: representar pagina por pagina el segmento seleccionado.

```js
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
          <span>Pagina ${page}</span>
          <strong>Marco ${frameNumber}</strong>
        </div>
        <div class="page-card-bar" aria-hidden="true">
          <span style="width:${occupancy.toFixed(2)}%"></span>
        </div>
        <small>
          Rango logico: ${formatHex(logicalStart)} - ${formatHex(logicalEnd)}<br />
          Base fisica: ${formatHex(frameNumber * state.pageSize)}
        </small>
      </article>
    `);
  }

  elements.pageMap.innerHTML = cards.join("") || '<div class="empty">No hay paginas para mostrar.</div>';
}
```

### Lo que hay que remarcar

- Se calcula una tarjeta por cada pagina del segmento.
- La pagina activa se resalta segun el offset escrito por el usuario.
- La barra visual muestra el porcentaje de ocupacion.
- La ultima pagina puede estar parcialmente llena, por eso su barra no siempre llega al 100%.

### Pregunta dificil posible

**Por que la ultima pagina tiene un calculo especial?**

Porque un segmento puede no ser multiplo exacto del tamano de pagina. En ese caso, la ultima pagina solo contiene una fraccion de bytes utiles.

---

## 17. Explicacion textual del modelo

Ademas del mapa visual, el proyecto genera texto educativo:

```js
function renderExplanation() {
  const offsetBits = pageOffsetBits(state.pageSize);
  const pageFieldBits = pageBits(state.pageSize);
  const segBits = segmentBits();
  const totalPages = TOTAL_LOGICAL_BYTES / state.pageSize;

  elements.explanationText.innerHTML = `
    <div>
      En un sistema con direccionamiento logico de <strong>2<sup>32</sup> bytes</strong>, el espacio de direcciones alcanza ${formatBytes(TOTAL_LOGICAL_BYTES)}.
      La tecnica de segmentacion paginada organiza esa capacidad en una direccion logica de ${LOGICAL_BITS} bits con tres campos claramente diferenciados:
    </div>
    <div class="formula">
      [ ${segBits} bits de segmento ] + [ ${pageFieldBits} bits de pagina ] + [ ${offsetBits} bits de desplazamiento ] = ${LOGICAL_BITS} bits
    </div>
    <div>
      El selector de segmento consume ${segBits} bits y permite identificar hasta ${2 ** segBits} segmentos independientes.
      Los bits restantes se asignan al numero de pagina dentro del segmento y al desplazamiento interno de la pagina, cuyo tamano depende de la politica de paginacion.
    </div>
    <div>
      Si el tamano de pagina es ${formatBytes(state.pageSize)}, el desplazamiento ocupa ${offsetBits} bits y cada segmento queda dividido en paginas de ese tamano.
      Durante la traduccion, el hardware o el sistema operativo consulta la tabla asociada al segmento para obtener el marco fisico correspondiente.
    </div>
    <div>
      En consecuencia, la traduccion completa sigue esta secuencia: <strong>segmento -> pagina -> marco fisico -> direccion fisica</strong>.
      Con la configuracion actual, el espacio logico contiene hasta ${totalPages.toLocaleString("es-ES")} paginas potenciales.
    </div>
  `;
}
```

### Por que este bloque es importante

Ayuda a que la sustentacion no dependa solo de ver colores o tarjetas. El texto convierte el simulador en una herramienta didactica y refuerza la explicacion teorica.

---

## 18. Mensajes de estado y errores

El simulador informa si una entrada es valida o no:

```js
function setMessage(text, type = "") {
  elements.messageBox.className = `message-box ${type}`.trim();
  elements.messageBox.innerHTML = text;
}
```

### Como funciona

- sin tipo, el mensaje queda neutro;
- con `success`, se resalta el resultado correcto;
- con `error`, se muestra un problema de validacion.

### Validacion de rango

```js
if (logicalOffset < 0 || logicalOffset >= segment.size) {
  setMessage(
    `El desplazamiento ingresado excede el limite del segmento <strong>${segment.name}</strong>. Su rango valido es de <strong>0</strong> a <strong>${segment.size - 1}</strong>.`,
    "error",
  );
  return;
}
```

### Que hay que defender

El sistema no deja continuar con un desplazamiento fuera del segmento porque en una traduccion real eso implicaria una referencia invalida o una falla de proteccion.

---

## 19. Traduccion completa en la interfaz

La funcion que conecta todo es `renderTranslation`.

```js
function renderTranslation() {
  const segmentIndex = Number(elements.segmentSelect.value);
  state.selectedSegmentIndex = segmentIndex;
  updateSegmentFromInputs();

  const segment = state.segments[segmentIndex];
  const logicalOffset = Number(elements.offsetInput.value || 0);
  const pageCount = getSegmentPageCount(segment);

  if (logicalOffset < 0 || logicalOffset >= segment.size) {
    setMessage(
      `El desplazamiento ingresado excede el limite del segmento <strong>${segment.name}</strong>. Su rango valido es de <strong>0</strong> a <strong>${segment.size - 1}</strong>.`,
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
  elements.segmentRange.textContent = `Base logica ${formatHex(logicalBase)} · limite ${formatHex(logicalBase + segment.size - 1)} · ${pageCount} paginas`;
  elements.pageResult.textContent = `Pagina ${translation.pageIndex}`;
  elements.offsetResult.textContent = `Offset ${translation.pageOffset} bytes dentro de la pagina`;
  elements.physicalAddress.textContent = formatHex(translation.physicalAddress);
  elements.frameResult.textContent = `Marco ${translation.frameNumber} · base fisica ${formatHex(translation.frameNumber * state.pageSize)}`;

  setMessage(
    `La direccion logica se descompuso en segmento, pagina y desplazamiento. El segmento <strong>${segment.name}</strong> apunta al marco <strong>${translation.frameNumber}</strong>, y la direccion fisica final es <strong>${formatHex(translation.physicalAddress)}</strong>.`,
    "success",
  );

  renderPageMap(segmentIndex);
  renderExplanation();
}
```

### Lectura paso a paso

1. Toma el segmento elegido.
2. Sincroniza el estado global.
3. Lee el offset dentro del segmento.
4. Valida que el offset exista dentro del rango permitido.
5. Llama a `createTranslation`.
6. Reescribe la interfaz con los resultados.
7. Actualiza el mapa de paginas y la explicacion textual.

### Esta es la funcion que debes ubicar rapido en defensa

Si el profesor pregunta "donde hacen la traduccion", la respuesta correcta es esta funcion y tambien `createTranslation`, porque una arma el resultado matematico y la otra lo muestra en pantalla.

---

## 20. Reset y ejemplo aleatorio

### 20.1 `resetExample`

```js
function resetExample() {
  state.pageSize = 4096;
  state.segments = structuredClone(DEFAULT_SEGMENTS);
  state.selectedSegmentIndex = 0;
  elements.pageSize.value = "4096";
  elements.segmentSelect.value = "0";
  elements.offsetInput.value = "1024";
  elements.frameBaseInput.value = String(state.segments[0].baseFrame);
  createSegmentInputs();
  createSegmentOptions();
  renderSegmentsTable();
  renderTranslation();
}
```

#### Que hace

- regresa el tamano de pagina al valor inicial;
- clona otra vez los segmentos base;
- selecciona el primer segmento;
- reconstruye la UI completa.

### 20.2 `randomExample`

```js
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
  renderTranslation();
}
```

#### Como defender esta funcion

No es solo decoracion. Sirve para generar ejemplos diversos y practicar sustentacion con distintos escenarios sin tener que escribir valores manualmente cada vez.

### 20.3 Carga de procesos

El plus del proyecto es que ahora puede cargar perfiles predefinidos de proceso desde un archivo JSON externo, cada uno con una distribucion distinta de segmentos. Ademas, el catalogo nuevo se conserva en el navegador con `localStorage` y puede descargarse otra vez como JSON actualizado:

```js
async function loadPrograms() {
  const storedPrograms = readStoredPrograms();
  if (storedPrograms) {
    state.programs = storedPrograms;
    return;
  }

  const sources = ["./programas.json", "programas.json"];

  for (const source of sources) {
    const response = await fetch(source);
    if (!response.ok) continue;

    const programs = await response.json();
    if (Array.isArray(programs) && programs.length > 0) {
      state.programs = programs;
      return;
    }
  }
}

function applyProcessProgram(programIndex) {
  const program = state.programs[programIndex];

  state.selectedProgramIndex = programIndex;
  state.segments = buildSegmentsFromProgram(program);
  state.selectedSegmentIndex = 0;

  createSegmentInputs();
  createSegmentOptions();
  syncInputsFromState();
  renderSegmentsTable();
  renderPageMap(0);
  renderProcessSummary();
  renderProcessMemoryMap();
  renderExplanation();
  renderTranslation();
}
```

### Que aporta esta mejora

- permite simular distintos procesos sin cambiar el codigo manualmente;
- el catálogo se alimenta desde `programas.json`, igual que en el laboratorio 4;
- los procesos nuevos no se pierden al recargar, porque se guardan en el navegador;
- tambien se pueden descargar como un `programas.json` actualizado;
- refuerza la idea de que cada proceso puede tener su propio mapa de memoria;
- da una respuesta clara si el profesor pregunta como se "carga" un proceso en la interfaz;
- sigue siendo una mejora minima porque no agrega planificadores ni concurrencia, solo cambia la configuracion de memoria activa.

### Como defender el plus

Si preguntan donde esta, la respuesta es:

- en el HTML, en el bloque de catálogo de procesos y el formulario de alta;
- en `programas.json`, que contiene el catálogo inicial;
- en `app.js`, en `loadPrograms()`, `applyProcessProgram()`, `addProcessProfile()` y la persistencia local;
- en la interfaz, porque al cambiar el proceso se regeneran los segmentos, la tabla y el mapa de paginas.

### 20.4 Persistencia y mapa de memoria

La mejora ya no se limita a crear procesos: ahora el catálogo tiene persistencia local y una vista mas clara de como queda distribuido el proceso en memoria.

```js
function renderProcessMemoryMap() {
  if (!elements.processMemoryMap) return;

  const cards = state.segments.map((segment, index) => {
    const pages = getSegmentPageCount(segment);
    const logicalBase = getSegmentLogicalBase(index);
    const logicalLimit = logicalBase + segment.size - 1;
    ...
  }).join("");

  elements.processMemoryMap.innerHTML = cards;
}
```

### Que muestra esta vista

- el tamano de cada segmento del proceso activo;
- cuantas paginas ocupa;
- el rango logico que cubre;
- el marco base y el marco final asignado;
- una previsualizacion de la correspondencia pagina → marco.

### Por que esto mejora la defensa

Si el profesor pregunta donde se ve la paginacion, ya no hay que responder solo con la tabla o con el calculo numerico. Se puede mostrar el panel de memoria del proceso activo y explicar visualmente como cada segmento se parte en paginas y se asigna a marcos.

---

## 21. Inicializacion general del programa

El arranque del simulador esta concentrado en `bootstrap`:

```js
function bootstrap() {
  createSegmentInputs();
  createSegmentOptions();
  renderSegmentsTable();
  renderExplanation();
  renderPageMap(0);
  renderTranslation();

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
    renderTranslation();
  });

  elements.translateBtn.addEventListener("click", renderTranslation);
  elements.randomBtn.addEventListener("click", randomExample);
  elements.resetBtn.addEventListener("click", resetExample);
}

bootstrap();
```

### Lo mas importante de esta parte

#### Orden de inicio

Primero se construye la interfaz, luego se renderizan los datos iniciales y despues se registran los eventos.

#### Por que esto es correcto

Porque el usuario ya encuentra una pantalla funcional desde el primer momento, sin tener que esperar a interactuar para ver resultados.

#### Donde vive la reaccion a eventos

Cada `addEventListener` indica que el sistema responde a cambios del usuario en tiempo real.

---

## 22. Explicacion del CSS en terminos de defensa

Aunque la parte de sistemas operativos esta en JavaScript, el CSS tambien apoya la demostracion visual.

### 22.1 Variables de tema

```css
:root {
  color-scheme: dark;
  --bg: #0a1020;
  --panel: rgba(11, 18, 36, 0.88);
  --text: #edf2ff;
  --brand: #7dd3fc;
  --ok: #34d399;
  --danger: #fb7185;
  --font-ui: "Inter", "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
}
```

Estas variables hacen posible mantener una identidad visual coherente y facilitan ajustes futuros.

### 22.2 Layout principal

El layout usa `grid` para separar hero, controles y resultados. Eso ayuda a que la informacion de defensa quede ordenada y no saturada.

### 22.3 Estados visuales

- `.message-box.success` resalta traducciones correctas.
- `.message-box.error` resalta errores de rango.
- `.page-card--active` identifica la pagina implicada en la traduccion.

### 22.4 Adaptacion a pantalla pequena

Los `@media` apilan las columnas en una sola para que el simulador siga siendo util en laptop o celular.

---

## 23. Ruta mental para defender el proyecto

Si el profesor pide explicar el flujo completo, la respuesta corta y tecnica es esta:

1. El usuario selecciona un tamano de pagina, un segmento y un offset.
2. El codigo valida que el offset pertenezca al segmento.
3. `createTranslation` calcula numero de pagina, desplazamiento, marco y direccion fisica.
4. `renderTranslation` escribe esos resultados en la pantalla.
5. `renderSegmentsTable` y `renderPageMap` muestran el contexto del segmento.
6. `renderExplanation` explica como se parte la direccion en bits.

### Frase corta para decir en sustentacion

"El sistema toma una direccion logica, la divide en segmento, pagina y desplazamiento, consulta la configuracion del segmento y produce una direccion fisica simulada junto con su representacion visual."

---

## 24. Preguntas que el profesor podria hacer y como responder

### 24.1 Donde se convierte la direccion logica en fisica?

En `createTranslation`, especificamente en estas lineas:

```js
const frameNumber = segment.baseFrame + pageIndex;
const physicalAddress = frameNumber * state.pageSize + pageOffset;
```

### 24.2 Donde validan que el offset sea correcto?

En `renderTranslation`, antes de llamar a `createTranslation`:

```js
if (logicalOffset < 0 || logicalOffset >= segment.size) {
  ...
}
```

### 24.3 Donde se define el tamano de pagina?

En el HTML, en el `<select id="pageSize">`, y luego en JavaScript dentro de `state.pageSize`.

### 24.4 Donde se calcula cuantas paginas tiene un segmento?

En `getSegmentPageCount`:

```js
return Math.ceil(segment.size / state.pageSize);
```

### 24.5 Donde se genera el mapa visual?

En `renderPageMap`.

### 24.6 Donde se recargan los datos del formulario al resetear?

En `resetExample`, donde se vuelve a clonar `DEFAULT_SEGMENTS` y se reconstruyen los inputs.

### 24.7 Por que usan `structuredClone`?

Para evitar mutar el arreglo base y poder restablecer el ejemplo limpio cada vez.

### 24.8 Esto representa memoria real del hardware?

No. Es una simulacion pedagogica de segmentacion paginada, pensada para entender el mecanismo y poder explicarlo.

### 24.9 Por que no hay una tabla hardware real de marcos libres?

Porque el proyecto no intenta administrar memoria real. Solo modela la traduccion logica-fisica con fines academicos.

### 24.10 Que pasa si el tamano de pagina no es potencia de 2?

El modelo de bits deja de ser consistente. Por eso la interfaz solo ofrece tamanos de pagina que son potencias de 2.

---

## 25. Limitaciones reales del proyecto

Para defender bien el trabajo tambien conviene reconocer sus limites:

- no hay algoritmo de reemplazo de paginas;
- no existe tabla de marcos libres o usados;
- no se implementan interrupciones ni MMU reales;
- la traduccion es didactica, no una emulacion de hardware;
- la cantidad de segmentos esta fija en el ejemplo inicial aunque el modelo reserve 3 bits.

Reconocer esto es positivo en una sustentacion porque muestra que entienden la diferencia entre una demostracion academica y un kernel real.

---

## 26. Conclusiones tecnicas

Este proyecto funciona como una herramienta de aprendizaje para explicar segmentacion paginada en un entorno visual y controlable. Su mayor valor no esta en la complejidad del codigo, sino en que cada bloque cumple una responsabilidad clara:

- `index.html` define la interfaz;
- `styles.css` organiza la presentacion;
- `app.js` implementa el modelo, la traduccion y la actualizacion dinamica.

La parte mas importante para defensa es recordar que:

- la direccion logica se descompone en campos;
- cada segmento tiene tamano y marco base;
- cada segmento se divide en paginas;
- el resultado final es una direccion fisica calculada a partir del marco y el desplazamiento.

---

## 27. Resumen corto para memorizar

Si necesitas decirlo en menos de 30 segundos:

"Este proyecto simula segmentacion paginada en un espacio logico de 32 bits. El usuario selecciona un segmento, un offset y un tamano de pagina. El programa valida el rango, calcula la pagina, el marco fisico y la direccion final, y luego muestra el resultado en pantalla junto con una tabla de segmentos, un mapa de paginas y una explicacion didactica del proceso."
