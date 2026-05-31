# Guía rápida — Segmentación Paginada

## Frase de una línea

"Cada proceso carga sus 5 segmentos en RAM; cada segmento se divide en páginas que
se asignan a marcos físicos. La traducción lógica→física sigue: segmento → página → marco → dirección."

---

## Dónde está cada concepto en `app.js`

### División de la dirección lógica (32 bits)

| Qué | Dónde | Detalle |
|---|---|---|
| Bits totales | `LOGICAL_BITS = 32` — línea 1 | Fija el espacio lógico |
| Bits de segmento | `segBitsCount()` — línea 52 | Siempre 3 → hasta 8 segmentos |
| Bits de offset | `offBits()` — línea 51 | `log₂(pageSize)` → 12 bits para 4 KiB |
| Bits de página | `pgBits()` — línea 53 | `32 − 3 − offBits` → 17 bits para 4 KiB |
| Construcción de la dirección lógica | `renderTranslationResult` — línea 444 | `(segIdx << (pb+ob)) \| (pageNum << ob) \| pageOff` |

**Ejemplo con 4 KiB:** `[3 bits segmento][17 bits página][12 bits offset] = 32 bits`

---

### Segmentación — cómo se definen los segmentos

| Qué | Dónde |
|---|---|
| Los 5 segmentos de cada proceso | `loadProgram()` — líneas 104–110 |
| Catálogo de procesos base | `DEFAULT_CATALOG` — líneas 10–16 |
| Estado de procesos en RAM | `state.loaded` — línea 26 |
| Tabla de segmentos en pantalla | `renderLoadedPrograms()` — línea 322 |

Cada segmento queda guardado como `{ name, size, baseFrame, pageCount }`.  
`baseFrame` y `pageCount` son suficientes para derivar toda la información sin arrays adicionales.

---

### Paginación — cómo se dividen los segmentos en páginas

| Qué | Dónde |
|---|---|
| Tamaño de página (configurable) | `state.pageSize` — línea 24; selector HTML `#pageSize` |
| Número de páginas de un segmento | `pageCnt(size)` — línea 55: `Math.ceil(size / pageSize)` |
| Total de marcos en la RAM | `totalFrames()` — línea 50: `Math.floor(TOTAL_RAM / pageSize)` |
| Tabla de páginas por segmento | `renderLoadedPrograms()` — líneas 337–344 (botón "▼ páginas") |

**Por qué `Math.ceil`:** la última página puede quedar incompleta. 5 000 bytes / 4 096 = 2 páginas (la segunda solo usa 904 bytes).

---

### Asignación de marcos — cómo se ocupa la RAM

| Qué | Dónde |
|---|---|
| Asignar marcos a un segmento | `allocFrames(count)` — líneas 96–100 |
| Cargar un proceso completo | `loadProgram(entry)` — líneas 102–127 |
| Verificar si cabe en RAM | Línea 112: `if (state.nextFrame + needed > tf) return null` |
| Descargar un proceso | `unloadProgram(loadId)` — líneas 129–136 |
| Limpiar toda la RAM | `clearRAM()` — líneas 138–142 |
| Próximo marco libre | `state.nextFrame` — línea 29 |

**Flujo de `loadProgram`:**
1. Suma las páginas de los 5 segmentos → `needed`
2. Comprueba `nextFrame + needed ≤ totalFrames`
3. Llama `allocFrames(pc)` por cada segmento → obtiene `baseFrame`
4. Guarda el proceso en `state.loaded`

---

### Traducción lógica → física

**Todo ocurre en `renderTranslationResult()` — líneas 419–502**

```
offset → pageNum  = Math.floor(offset / pageSize)   línea 440
       → pageOff  = offset % pageSize                línea 441
pageNum → frameNum = seg.baseFrame + pageNum          línea 442
frameNum → physAddr = frameNum * pageSize + pageOff   línea 443
```

| Qué | Dónde |
|---|---|
| Validación de offset | Línea 432: `if (offset < 0 \|\| offset >= seg.size)` |
| Número de página | Línea 440: `Math.floor(offset / state.pageSize)` |
| Marco físico | Línea 442: `seg.baseFrame + pageNum` |
| Dirección física | Línea 443: `frameNum * state.pageSize + pageOff` |
| Diagrama de bits en pantalla | Líneas 474–500 (colores amarillo/azul/verde) |

---

### Mapa visual de RAM

| Qué | Dónde |
|---|---|
| Mapa de marcos por segmento | `renderFrameMap()` — líneas 253–305 |
| Barra de uso proporcional | `renderRAMOverview()` — líneas 221–251 |
| Leyenda de colores | `renderRAMLegend()` — líneas 307–319 |
| Estadísticas del hero | `renderHeroStats()` — líneas 144–175 |
| Límite de celdas por fila | `MAX_VISUAL_CELLS = 256` — línea 19 |
| Límite de la tabla de páginas | `MAX_PT_ENTRIES = 200` — línea 20 |

**Por qué los límites:** un proceso de 2 GiB genera 524 288 páginas. Sin límite, insertar 524 288 `<div>` congela el navegador. Con 256 celdas, cada una agrupa `⌈pageCount/256⌉` páginas; el tooltip muestra el rango.

---

### Persistencia del catálogo

| Qué | Dónde |
|---|---|
| Guardar en navegador | `saveCatalog()` — línea 58 (`localStorage`) |
| Leer al arrancar | `initCatalog()` — línea 62 |
| Cargar desde archivo | `tryLoadFromJson()` — línea 73 (`fetch programas.json`) |
| Exportar JSON | Listener `#exportBtn` — línea 624 |
| Agregar proceso | Listener `#addForm submit` — línea 634 |
| Eliminar del catálogo | Listener `[data-del-key]` — línea 586 |

**Orden de arranque:** `initCatalog` (localStorage) → si vacío: `tryLoadFromJson` → `setupEvents` → `renderAll`

---

### Fragmentación

Cuando se descarga un proceso intermedio, sus marcos quedan como "huecos".
`nextFrame` se recalcula como el marco más alto aún en uso (`unloadProgram` — línea 133).
Los huecos solo se recuperan con `clearRAM()`.

---

### Preguntas rápidas

| Pregunta | Respuesta en 1 línea | Función / línea |
|---|---|---|
| ¿Dónde se traduce la dirección? | `renderTranslationResult` | línea 419 |
| ¿Dónde se asignan marcos? | `allocFrames` dentro de `loadProgram` | líneas 96 y 120 |
| ¿Dónde se libera memoria? | `unloadProgram` | línea 129 |
| ¿Dónde se define el tamaño de página? | `state.pageSize` + selector `#pageSize` | línea 24 |
| ¿Dónde se calcula cuántas páginas? | `pageCnt(size) = Math.ceil(size/pageSize)` | línea 55 |
| ¿Dónde se muestra la tabla de páginas? | botón "▼ páginas" en `renderLoadedPrograms` | línea 337 |
| ¿Por qué no hay `frameMap`? | Causaría 524 288 objetos para 2 GiB — se deriva de `baseFrame+pageCount` | línea 26 |
| ¿Puede cambiar el tamaño de página con procesos cargados? | No — listener `#pageSize change` lo bloquea | línea 655 |
| ¿Esto es memoria real? | No, es simulación didáctica sin MMU ni TLB | — |
