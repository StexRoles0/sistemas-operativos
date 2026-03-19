/* ==========================================================
   Simulador de Procesos (lógica principal)
   - Planificación FCFS / SJF / SRTF
   - Ejecución por ticks de CPU
   - Historial textual + historial visual por matriz temporal
   ========================================================== */

class EventoHistorial {
    constructor(procesoId, procesoNombre, estadoAnterior, estadoNuevo, tick) {
        this.timestamp = new Date();
        this.procesoId = procesoId;
        this.procesoNombre = procesoNombre;
        this.estadoAnterior = estadoAnterior;
        this.estadoNuevo = estadoNuevo;
        this.tick = tick;
    }

    getTiempoFormateado() {
        return this.timestamp.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }
}

class Proceso {
    static contadorId = 0;

    constructor(nombre, tiempoEstimado, tickCreacion) {
        this.id = ++Proceso.contadorId;
        this.nombre = nombre || `Proceso_${this.id}`;
        this.tiempoTotal = parseInt(tiempoEstimado, 10);
        this.tiempoRestante = this.tiempoTotal;

        this.estado = 'nuevo';
        this.tickCreacion = tickCreacion;
        this.tickPrimeraRespuesta = null;
        this.tickFinalizacion = null;

        this.tiempoEspera = 0;
        this.tiempoEjecucion = 0;
        this.tiempoBloqueado = 0;
        this.vecesBloqueado = 0;
    }

    avanzar() {
        if (this.tiempoRestante <= 0) {
            return false;
        }

        this.tiempoRestante -= 1;
        this.tiempoEjecucion += 1;
        return true;
    }

    getProgreso() {
        return ((this.tiempoTotal - this.tiempoRestante) / this.tiempoTotal) * 100;
    }

    estaTerminado() {
        return this.tiempoRestante <= 0;
    }

    getMetricas() {
        if (this.tickFinalizacion === null) {
            return null;
        }

        const retorno = this.tickFinalizacion - this.tickCreacion;
        const tiempoPerdido = retorno - this.tiempoTotal;
        const penalidad = this.tiempoTotal > 0 ? retorno / this.tiempoTotal : 0;
        const respuesta = this.tickPrimeraRespuesta === null
            ? null
            : this.tickPrimeraRespuesta - this.tickCreacion;

        return {
            retorno,
            tiempoPerdido,
            tiempoEspera: this.tiempoEspera,
            penalidad,
            respuesta
        };
    }
}

class SimuladorAutonomo {
    constructor() {
        this.procesos = [];
        this.estados = {
            nuevo: [],
            listo: [],
            ejecucion: [],
            bloqueado: [],
            terminado: []
        };

        this.historial = [];
        this.matrizTicks = new Map();

        this.simulando = false;
        this.produccionAutomatica = true;
        this.intervalo = null;
        this.velocidad = 5;
        this.ticksCPU = 0;

        this.probabilidadBloqueo = 0.25;
        this.probabilidadNuevoProceso = 0.35;

        this.filtroActual = 'todos';
        this.algoritmoActual = 'FCFS';

        this.procesosPredefinidos = [
            { nombre: 'System', ticks: 4, seleccionado: false },
            { nombre: 'Explorer', ticks: 3, seleccionado: false },
            { nombre: 'Chrome', ticks: 6, seleccionado: false },
            { nombre: 'Antivirus', ticks: 5, seleccionado: false },
            { nombre: 'Update', ticks: 3, seleccionado: false },
            { nombre: 'Spotify', ticks: 4, seleccionado: false }
        ];

        this.iniciarVista();
        this.renderizarProcesosPredefinidos();
        this.actualizarTextoAlgoritmo();
    }

    iniciarVista() {
        this.registrarSnapshotTick();
        this.actualizarVista();
    }

    renderizarProcesosPredefinidos() {
        const contenedor = document.getElementById('procesosSistema');
        if (!contenedor) return;

        contenedor.innerHTML = this.procesosPredefinidos.map((proceso, index) => `
            <div class="proceso-predefinido">
                <label>
                    <input type="checkbox" class="proceso-checkbox" data-index="${index}"
                           ${proceso.seleccionado ? 'checked' : ''}>
                    <span class="proceso-nombre-sistema">${proceso.nombre}</span>
                    <span class="proceso-ticks">⏱️ ${proceso.ticks} ticks</span>
                </label>
            </div>
        `).join('');

        document.querySelectorAll('.proceso-checkbox').forEach((checkbox) => {
            checkbox.addEventListener('change', (event) => {
                const index = Number(event.target.dataset.index);
                this.procesosPredefinidos[index].seleccionado = event.target.checked;
            });
        });
    }

    agregarSeleccionados() {
        const seleccionados = this.procesosPredefinidos.filter((p) => p.seleccionado);

        seleccionados.forEach((procesoBase) => {
            const proceso = this.crearProceso(procesoBase.nombre, procesoBase.ticks, false);
            procesoBase.seleccionado = false;
            this.registrarEvento(proceso.id, 'none', 'nuevo');
        });

        this.renderizarProcesosPredefinidos();
        this.actualizarVista();
    }

    crearProceso(nombre, tiempo, registrar = true) {
        const proceso = new Proceso(nombre, tiempo, this.ticksCPU);
        this.procesos.push(proceso);
        this.estados.nuevo.push(proceso);

        if (registrar) {
            this.registrarEvento(proceso.id, 'none', 'nuevo');
        }

        return proceso;
    }

    crearProcesoManual() {
        const nombre = document.getElementById('nombreProceso').value || 'Proceso';
        const tiempo = document.getElementById('tiempoProceso').value;
        this.crearProceso(nombre, tiempo, true);
        this.actualizarVista();
    }

    crearProcesoAleatorio() {
        const nombres = ['System', 'User', 'Browser', 'Editor', 'Game', 'App', 'Service', 'Daemon', 'Process', 'Task'];
        const nombre = nombres[Math.floor(Math.random() * nombres.length)];
        const tiempo = [2, 3, 4, 5, 6, 8][Math.floor(Math.random() * 6)];
        this.crearProceso(nombre, tiempo, true);
        this.actualizarVista();
    }

    cambiarAlgoritmo(algoritmo) {
        const permitidos = ['FCFS', 'SJF', 'SRTF'];
        if (!permitidos.includes(algoritmo)) {
            return;
        }

        this.algoritmoActual = algoritmo;
        this.actualizarTextoAlgoritmo();

        // Si SRTF está activo, intentamos preemptar inmediatamente.
        if (this.algoritmoActual === 'SRTF') {
            this.evaluarPreempcionSRTF();
        }

        this.actualizarVista();
    }

    actualizarTextoAlgoritmo() {
        const etiqueta = document.getElementById('algoritmoActualTexto');
        if (etiqueta) {
            etiqueta.textContent = `Actual: ${this.algoritmoActual}`;
        }
    }

    toggleProduccionAutomatica(activo) {
        this.produccionAutomatica = activo;
        const prodOnLabel = document.getElementById('prodOnLabel');
        const prodOffLabel = document.getElementById('prodOffLabel');

        if (activo) {
            prodOnLabel.style.opacity = '1';
            prodOffLabel.style.opacity = '0.5';
        } else {
            prodOnLabel.style.opacity = '0.5';
            prodOffLabel.style.opacity = '1';
        }
    }

    iniciar() {
        if (this.simulando) {
            return;
        }

        this.simulando = true;
        document.getElementById('btnIniciar').disabled = true;
        document.getElementById('btnPausar').disabled = false;

        this.intervalo = setInterval(() => {
            this.tickSimulacion();
        }, 1000 / this.velocidad);
    }

    pausar() {
        if (!this.simulando) {
            return;
        }

        this.simulando = false;
        document.getElementById('btnIniciar').disabled = false;
        document.getElementById('btnPausar').disabled = true;

        if (this.intervalo) {
            clearInterval(this.intervalo);
            this.intervalo = null;
        }
    }

    ajustarVelocidad(valor) {
        this.velocidad = parseInt(valor, 10);
        const velocidades = ['Muy lenta', 'Lenta', 'Normal', 'Rápida', 'Muy rápida'];
        const indice = Math.min(4, Math.floor((this.velocidad - 1) / 2));
        document.getElementById('velocidadTexto').textContent = `Velocidad: ${velocidades[indice]}`;

        if (this.simulando) {
            this.pausar();
            this.iniciar();
        }
    }

    tickSimulacion() {
        this.ticksCPU += 1;

        this.admitirNuevosProcesos();

        if (this.produccionAutomatica && Math.random() < this.probabilidadNuevoProceso) {
            this.crearProcesoAleatorio();
        }

        this.procesarDesbloqueos();
        this.ejecutarTickCPU();
        this.actualizarTiemposEspera();

        this.registrarSnapshotTick();
        this.actualizarVista();
    }

    admitirNuevosProcesos() {
        let admitidos = 0;

        while (this.estados.nuevo.length > 0 && admitidos < 2) {
            const proceso = this.estados.nuevo.shift();
            const estadoAnterior = proceso.estado;
            proceso.estado = 'listo';
            this.estados.listo.push(proceso);
            this.registrarEvento(proceso.id, estadoAnterior, 'listo');
            admitidos += 1;
        }
    }

    procesarDesbloqueos() {
        const permanecenBloqueados = [];

        for (const proceso of this.estados.bloqueado) {
            proceso.tiempoBloqueado += 1;

            if (Math.random() < 0.2) {
                const estadoAnterior = proceso.estado;
                proceso.estado = 'listo';
                this.estados.listo.push(proceso);
                this.registrarEvento(proceso.id, estadoAnterior, 'listo');
            } else {
                permanecenBloqueados.push(proceso);
            }
        }

        this.estados.bloqueado = permanecenBloqueados;
    }

    ejecutarTickCPU() {
        this.seleccionarProcesoParaCPU();

        const actual = this.estados.ejecucion[0];
        if (!actual) {
            return;
        }

        if (actual.tickPrimeraRespuesta === null) {
            actual.tickPrimeraRespuesta = this.ticksCPU;
        }

        actual.avanzar();

        if (actual.estaTerminado()) {
            actual.tickFinalizacion = this.ticksCPU;
            this.estados.ejecucion.shift();
            actual.estado = 'terminado';
            this.estados.terminado.push(actual);
            this.registrarEvento(actual.id, 'ejecucion', 'terminado');
            return;
        }

        if (Math.random() < this.probabilidadBloqueo) {
            this.estados.ejecucion.shift();
            actual.estado = 'bloqueado';
            actual.vecesBloqueado += 1;
            this.estados.bloqueado.push(actual);
            this.registrarEvento(actual.id, 'ejecucion', 'bloqueado');
            return;
        }

        if (this.algoritmoActual === 'SRTF') {
            this.evaluarPreempcionSRTF();
        }
    }

    seleccionarProcesoParaCPU() {
        if (this.estados.ejecucion.length > 0) {
            if (this.algoritmoActual === 'SRTF') {
                this.evaluarPreempcionSRTF();
            }
            return;
        }

        const indice = this.obtenerIndiceSiguienteListo();
        if (indice === -1) {
            return;
        }

        const proceso = this.estados.listo.splice(indice, 1)[0];
        proceso.estado = 'ejecucion';
        this.estados.ejecucion.push(proceso);
        this.registrarEvento(proceso.id, 'listo', 'ejecucion');
    }

    obtenerIndiceSiguienteListo() {
        if (this.estados.listo.length === 0) {
            return -1;
        }

        if (this.algoritmoActual === 'FCFS') {
            return 0;
        }

        if (this.algoritmoActual === 'SJF') {
            let indice = 0;
            for (let i = 1; i < this.estados.listo.length; i += 1) {
                const actual = this.estados.listo[i];
                const elegido = this.estados.listo[indice];
                if (actual.tiempoTotal < elegido.tiempoTotal ||
                    (actual.tiempoTotal === elegido.tiempoTotal && actual.id < elegido.id)) {
                    indice = i;
                }
            }
            return indice;
        }

        // SRTF
        let indice = 0;
        for (let i = 1; i < this.estados.listo.length; i += 1) {
            const actual = this.estados.listo[i];
            const elegido = this.estados.listo[indice];
            if (actual.tiempoRestante < elegido.tiempoRestante ||
                (actual.tiempoRestante === elegido.tiempoRestante && actual.id < elegido.id)) {
                indice = i;
            }
        }
        return indice;
    }

    evaluarPreempcionSRTF() {
        if (this.algoritmoActual !== 'SRTF') {
            return;
        }

        if (this.estados.ejecucion.length === 0 || this.estados.listo.length === 0) {
            return;
        }

        const enCPU = this.estados.ejecucion[0];
        const indiceMejorListo = this.obtenerIndiceSiguienteListo();
        const mejorListo = this.estados.listo[indiceMejorListo];

        if (!mejorListo || mejorListo.tiempoRestante >= enCPU.tiempoRestante) {
            return;
        }

        this.estados.ejecucion.shift();
        enCPU.estado = 'listo';
        this.estados.listo.push(enCPU);
        this.registrarEvento(enCPU.id, 'ejecucion', 'listo');

        const siguiente = this.estados.listo.splice(this.obtenerIndiceSiguienteListo(), 1)[0];
        siguiente.estado = 'ejecucion';
        this.estados.ejecucion.push(siguiente);
        this.registrarEvento(siguiente.id, 'listo', 'ejecucion');
    }

    actualizarTiemposEspera() {
        for (const proceso of this.estados.listo) {
            proceso.tiempoEspera += 1;
        }
    }

    registrarEvento(procesoId, estadoAnterior, estadoNuevo) {
        const proceso = this.procesos.find((p) => p.id === procesoId);
        if (!proceso) {
            return;
        }

        const evento = new EventoHistorial(
            proceso.id,
            proceso.nombre,
            estadoAnterior,
            estadoNuevo,
            this.ticksCPU
        );

        this.historial.unshift(evento);
        this.actualizarHistorial();
        this.actualizarSelectorProcesos();
    }

    actualizarSelectorProcesos() {
        const selector = document.getElementById('filtroProceso');
        if (!selector) return;

        const valorActual = selector.value;
        const procesosUnicos = [...new Set(this.historial.map((e) => e.procesoId))];
        const opciones = ['<option value="todos">🎯 Todos los procesos</option>'];

        procesosUnicos.forEach((id) => {
            const proceso = this.procesos.find((p) => p.id === id);
            if (!proceso) return;

            const selected = String(valorActual) === String(id) ? 'selected' : '';
            opciones.push(`<option value="${id}" ${selected}>📌 ${proceso.nombre} (ID: ${id})</option>`);
        });

        selector.innerHTML = opciones.join('');
    }

    filtrarHistorial(procesoId) {
        this.filtroActual = procesoId;
        this.actualizarHistorial();
    }

    actualizarHistorial() {
        const contenedor = document.getElementById('historial');
        if (!contenedor) return;

        const eventosFiltrados = this.filtroActual === 'todos'
            ? this.historial
            : this.historial.filter((e) => String(e.procesoId) === String(this.filtroActual));

        contenedor.innerHTML = '';

        if (eventosFiltrados.length === 0) {
            contenedor.innerHTML = '<div style="text-align:center;padding:20px;color:#95a5a6;">No hay eventos para mostrar</div>';
            return;
        }

        eventosFiltrados.forEach((evento) => {
            const item = document.createElement('div');
            item.className = 'evento-historial';
            item.innerHTML = `
                <span class="evento-tiempo">${evento.getTiempoFormateado()}</span>
                <span class="evento-proceso">${evento.procesoNombre} #${evento.procesoId}</span>
                <span class="evento-estado estado-${evento.estadoAnterior}">${evento.estadoAnterior}</span>
                <span>→</span>
                <span class="evento-estado estado-${evento.estadoNuevo}">${evento.estadoNuevo}</span>
                <span class="evento-detalle">Tick ${evento.tick}</span>
            `;
            contenedor.appendChild(item);
        });
    }

    limpiarHistorial() {
        this.historial = [];
        this.actualizarHistorial();
        this.actualizarSelectorProcesos();
    }

    seleccionarProceso(event) {
        const procesoItem = event.target.closest('.proceso-item');
        if (!procesoItem) {
            return;
        }

        const idMatch = procesoItem.innerHTML.match(/#(\d+)/);
        if (!idMatch) {
            return;
        }

        const id = idMatch[1];
        document.getElementById('filtroProceso').value = id;
        this.filtrarHistorial(id);
    }

    registrarSnapshotTick() {
        const tick = this.ticksCPU;

        this.procesos.forEach((proceso) => {
            if (!this.matrizTicks.has(proceso.id)) {
                this.matrizTicks.set(proceso.id, []);
            }
            const fila = this.matrizTicks.get(proceso.id);
            fila[tick] = proceso.estado;
        });
    }

    renderizarTimeline() {
        const tabla = document.getElementById('tablaTimeline');
        if (!tabla) return;

        if (this.procesos.length === 0) {
            tabla.innerHTML = `
                <thead>
                    <tr><th>Proceso</th><th>Tick 0</th></tr>
                </thead>
                <tbody>
                    <tr><td>Sin procesos</td><td class="timeline-cell-vacio">-</td></tr>
                </tbody>
            `;
            return;
        }

        const headerTicks = [];
        for (let tick = 0; tick <= this.ticksCPU; tick += 1) {
            headerTicks.push(`<th>${tick}</th>`);
        }

        const ordenados = [...this.procesos].sort((a, b) => a.id - b.id);
        const simbolos = {
            nuevo: 'N',
            listo: 'L',
            ejecucion: 'E',
            bloqueado: 'B',
            terminado: 'T'
        };

        const filas = ordenados.map((proceso) => {
            const fila = this.matrizTicks.get(proceso.id) || [];
            const celdas = [];

            for (let tick = 0; tick <= this.ticksCPU; tick += 1) {
                const estado = fila[tick] || '';
                const simbolo = simbolos[estado] || '-';
                const clase = estado ? `estado-${estado}` : 'timeline-cell-vacio';
                const titulo = estado ? `${proceso.nombre} en ${estado} (tick ${tick})` : 'Sin registro';
                celdas.push(`<td class="${clase}" title="${titulo}">${simbolo}</td>`);
            }

            return `
                <tr>
                    <td>${proceso.nombre} #${proceso.id}</td>
                    ${celdas.join('')}
                </tr>
            `;
        }).join('');

        tabla.innerHTML = `
            <thead>
                <tr>
                    <th>Proceso / Tick</th>
                    ${headerTicks.join('')}
                </tr>
            </thead>
            <tbody>
                ${filas}
            </tbody>
        `;
    }

    renderizarMetricas() {
        const tabla = document.getElementById('tablaMetricas');
        if (!tabla) return;

        if (this.procesos.length === 0) {
            tabla.innerHTML = `
                <thead>
                    <tr><th>Proceso</th><th>Estado</th></tr>
                </thead>
                <tbody>
                    <tr><td>Sin procesos</td><td class="timeline-cell-vacio">-</td></tr>
                </tbody>
            `;
            return;
        }

        const filas = [];
        const terminados = [];

        [...this.procesos].sort((a, b) => a.id - b.id).forEach((proceso) => {
            const metricas = proceso.getMetricas();

            if (metricas) {
                terminados.push(metricas);
            }

            filas.push(`
                <tr>
                    <td>${proceso.nombre} #${proceso.id}</td>
                    <td>${proceso.tickCreacion}</td>
                    <td>${proceso.tickPrimeraRespuesta ?? '-'}</td>
                    <td>${proceso.tickFinalizacion ?? '-'}</td>
                    <td>${metricas ? metricas.retorno : '-'}</td>
                    <td>${metricas ? metricas.tiempoPerdido : '-'}</td>
                    <td>${proceso.tiempoEspera}</td>
                    <td>${metricas ? metricas.penalidad.toFixed(2) : '-'}</td>
                    <td>${metricas && metricas.respuesta !== null ? metricas.respuesta : '-'}</td>
                </tr>
            `);
        });

        let filaPromedio = '';
        if (terminados.length > 0) {
            const promedio = (clave) => terminados.reduce((acc, m) => acc + m[clave], 0) / terminados.length;
            filaPromedio = `
                <tr class="fila-promedio">
                    <td>Promedio (terminados)</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>${promedio('retorno').toFixed(2)}</td>
                    <td>${promedio('tiempoPerdido').toFixed(2)}</td>
                    <td>${promedio('tiempoEspera').toFixed(2)}</td>
                    <td>${promedio('penalidad').toFixed(2)}</td>
                    <td>${promedio('respuesta').toFixed(2)}</td>
                </tr>
            `;
        }

        tabla.innerHTML = `
            <thead>
                <tr>
                    <th>Proceso</th>
                    <th>Llegada</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Retorno</th>
                    <th>Tiempo perdido</th>
                    <th>Espera</th>
                    <th>Penalidad</th>
                    <th>Respuesta</th>
                </tr>
            </thead>
            <tbody>
                ${filas.join('')}
                ${filaPromedio}
            </tbody>
        `;
    }

    actualizarVista() {
        this.renderizarColumna('nuevos', this.estados.nuevo);
        this.renderizarColumna('listos', this.estados.listo);
        this.renderizarColumna('ejecucion', this.estados.ejecucion);
        this.renderizarColumna('bloqueados', this.estados.bloqueado);
        this.renderizarColumna('terminados', this.estados.terminado);

        document.getElementById('totalProcesos').textContent = this.procesos.length;
        document.getElementById('procesosActivos').textContent =
            this.estados.nuevo.length + this.estados.listo.length +
            this.estados.ejecucion.length + this.estados.bloqueado.length;
        document.getElementById('procesosTerminados').textContent = this.estados.terminado.length;
        document.getElementById('ticksCPU').textContent = this.ticksCPU;
        document.getElementById('totalEventos').textContent = this.historial.length;

        this.renderizarTimeline();
        this.renderizarMetricas();
    }

    renderizarColumna(elementId, procesos) {
        const contenedor = document.getElementById(elementId);
        if (!contenedor) return;

        contenedor.innerHTML = '';

        procesos.forEach((proceso) => {
            const item = document.createElement('div');
            item.className = `proceso-item ${proceso.estado}`;
            const progreso = proceso.getProgreso();

            item.innerHTML = `
                <div class="proceso-header">
                    <span class="proceso-nombre">${proceso.nombre}</span>
                    <span class="proceso-id">#${proceso.id}</span>
                </div>
                <div class="proceso-tiempo">
                    <span>⏱️ ${proceso.tiempoRestante}/${proceso.tiempoTotal} ticks</span>
                    <span>⌛ ${proceso.tiempoEspera}t</span>
                </div>
                <div class="barra-progreso">
                    <div class="progreso" style="width:${progreso}%"></div>
                </div>
                ${proceso.vecesBloqueado > 0 ? `<span class="badge-info">Bloqueado ${proceso.vecesBloqueado} vez/veces</span>` : ''}
            `;

            contenedor.appendChild(item);
        });

        if (procesos.length === 0) {
            const vacio = document.createElement('div');
            vacio.style.textAlign = 'center';
            vacio.style.padding = '20px';
            vacio.style.color = '#95a5a6';
            vacio.textContent = 'Vacío';
            contenedor.appendChild(vacio);
        }
    }

    resetear() {
        this.pausar();

        this.procesos = [];
        this.estados = {
            nuevo: [],
            listo: [],
            ejecucion: [],
            bloqueado: [],
            terminado: []
        };
        this.historial = [];
        this.matrizTicks = new Map();

        this.ticksCPU = 0;
        this.filtroActual = 'todos';

        Proceso.contadorId = 0;

        this.procesosPredefinidos.forEach((proceso) => {
            proceso.seleccionado = false;
        });

        this.renderizarProcesosPredefinidos();

        document.getElementById('btnIniciar').disabled = false;
        document.getElementById('btnPausar').disabled = true;

        this.actualizarSelectorProcesos();
        this.registrarSnapshotTick();
        this.actualizarVista();
    }
}

const simulador = new SimuladorAutonomo();
