/* ==========================================================
   Simulador de Procesos (lógica principal)
   - Maneja estados de procesos
   - Ejecuta ciclos de simulación
   - Actualiza UI e historial en tiempo real
   ========================================================== */

/**
 * Representa un evento de cambio de estado de un proceso.
 * Se usa para mostrar trazabilidad en el panel de historial.
 */
class EventoHistorial {
    constructor(procesoId, procesoNombre, estadoAnterior, estadoNuevo, ciclo) {
        this.timestamp = new Date();
        this.procesoId = procesoId;
        this.procesoNombre = procesoNombre;
        this.estadoAnterior = estadoAnterior;
        this.estadoNuevo = estadoNuevo;
        this.ciclo = ciclo;
    }

    /**
     * Devuelve la hora del evento con milisegundos.
     */
    getTiempoFormateado() {
        return this.timestamp.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }
}

/**
 * Modelo de un proceso del sistema.
 */
class Proceso {
    static contadorId = 0;

    constructor(nombre, tiempoEstimado) {
        this.id = ++Proceso.contadorId;
        this.nombre = nombre || `Proceso_${this.id}`;
        this.tiempoTotal = parseInt(tiempoEstimado);
        this.tiempoRestante = this.tiempoTotal;
        this.estado = 'nuevo';
        this.tiempoCreacion = Date.now();
        this.tiempoEspera = 0;
        this.tiempoEjecucion = 0;
        this.tiempoBloqueado = 0;
        this.vecesBloqueado = 0;
    }

    /**
     * Consume una unidad de tiempo de CPU.
     * @returns {boolean} true si avanzó, false si ya no tenía tiempo restante.
     */
    avanzar() {
        if (this.tiempoRestante > 0) {
            this.tiempoRestante--;
            this.tiempoEjecucion++;
            return true;
        }
        return false;
    }

    /**
     * Calcula porcentaje de progreso del proceso.
     */
    getProgreso() {
        return ((this.tiempoTotal - this.tiempoRestante) / this.tiempoTotal) * 100;
    }

    /**
     * Indica si el proceso terminó su ejecución.
     */
    estaTerminado() {
        return this.tiempoRestante <= 0;
    }

    /**
     * Devuelve estadísticas individuales del proceso.
     */
    getStats() {
        return {
            id: this.id,
            nombre: this.nombre,
            tiempoTotal: this.tiempoTotal,
            tiempoEjecucion: this.tiempoEjecucion,
            tiempoEspera: this.tiempoEspera,
            tiempoBloqueado: this.tiempoBloqueado,
            vecesBloqueado: this.vecesBloqueado
        };
    }
}

/**
 * Orquestador principal de la simulación.
 * Mantiene estado global y sincroniza datos con la interfaz.
 */
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
        this.simulando = false;
        this.produccionAutomatica = true;
        this.intervalo = null;
        this.velocidad = 5;
        this.ciclosCPU = 0;
        this.probabilidadBloqueo = 0.3;
        this.probabilidadNuevoProceso = 0.4;
        this.filtroActual = 'todos';

        this.iniciarVista();
    }

    /**
     * Carga procesos base para iniciar la experiencia.
     */
    iniciarVista() {
        this.crearProceso('System', 4);
        this.crearProceso('Explorer', 3);
        this.crearProceso('Chrome', 6);
        this.actualizarVista();
    }

    /**
     * Enciende/apaga la creación automática de procesos.
     */
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

    /**
     * Registra transición de estado en el historial.
     */
    registrarEvento(procesoId, estadoAnterior, estadoNuevo) {
        const proceso = this.procesos.find(p => p.id === procesoId);
        if (!proceso) return;

        const evento = new EventoHistorial(
            procesoId,
            proceso.nombre,
            estadoAnterior,
            estadoNuevo,
            this.ciclosCPU
        );

        this.historial.unshift(evento);
        this.actualizarHistorial();
        this.actualizarSelectorProcesos();
    }

    /**
     * Rellena selector para filtrar historial por proceso.
     */
    actualizarSelectorProcesos() {
        const selector = document.getElementById('filtroProceso');
        const valorActual = selector.value;

        const procesosUnicos = [...new Set(this.historial.map(e => e.procesoId))];
        const opciones = ['<option value="todos">🎯 Todos los procesos</option>'];

        procesosUnicos.forEach(id => {
            const proceso = this.procesos.find(p => p.id === id);
            if (proceso) {
                const selected = valorActual == id ? 'selected' : '';
                opciones.push(`<option value="${id}" ${selected}>📌 ${proceso.nombre} (ID: ${id})</option>`);
            }
        });

        selector.innerHTML = opciones.join('');
    }

    /**
     * Define filtro de historial por id o "todos".
     */
    filtrarHistorial(procesoId) {
        this.filtroActual = procesoId;
        this.actualizarHistorial();
    }

    /**
     * Dibuja el panel de historial según filtro actual.
     */
    actualizarHistorial() {
        const contenedor = document.getElementById('historial');
        const eventosFiltrados = this.filtroActual === 'todos'
            ? this.historial
            : this.historial.filter(e => e.procesoId == this.filtroActual);

        contenedor.innerHTML = '';

        if (eventosFiltrados.length === 0) {
            contenedor.innerHTML = '<div style="text-align: center; padding: 20px; color: #95a5a6;">No hay eventos para mostrar</div>';
            return;
        }

        eventosFiltrados.forEach(evento => {
            const item = document.createElement('div');
            item.className = 'evento-historial';

            item.innerHTML = `
                <span class="evento-tiempo">${evento.getTiempoFormateado()}</span>
                <span class="evento-proceso">${evento.procesoNombre} #${evento.procesoId}</span>
                <span class="evento-estado estado-${evento.estadoAnterior}">${evento.estadoAnterior}</span>
                <span>→</span>
                <span class="evento-estado estado-${evento.estadoNuevo}">${evento.estadoNuevo}</span>
                <span class="evento-detalle">Ciclo ${evento.ciclo}</span>
            `;

            contenedor.appendChild(item);
        });
    }

    /**
     * Borra historial completo de eventos.
     */
    limpiarHistorial() {
        this.historial = [];
        this.actualizarHistorial();
        this.actualizarSelectorProcesos();
    }

    /**
     * Permite seleccionar un proceso desde cualquier columna para filtrar historial.
     */
    seleccionarProceso(event) {
        const procesoItem = event.target.closest('.proceso-item');
        if (!procesoItem) return;

        const idMatch = procesoItem.innerHTML.match(/#(\d+)/);
        if (idMatch) {
            const id = idMatch[1];
            document.getElementById('filtroProceso').value = id;
            this.filtrarHistorial(id);
        }
    }

    /**
     * Inicia el ciclo periódico de simulación.
     */
    iniciar() {
        if (!this.simulando) {
            this.simulando = true;
            document.getElementById('btnIniciar').disabled = true;
            document.getElementById('btnPausar').disabled = false;

            this.intervalo = setInterval(() => {
                this.cicloSimulacion();
            }, 1000 / this.velocidad);
        }
    }

    /**
     * Pausa la simulación y libera el intervalo.
     */
    pausar() {
        if (this.simulando) {
            this.simulando = false;
            document.getElementById('btnIniciar').disabled = false;
            document.getElementById('btnPausar').disabled = true;

            if (this.intervalo) {
                clearInterval(this.intervalo);
                this.intervalo = null;
            }
        }
    }

    /**
     * Ajusta la velocidad y reinicia intervalo si ya estaba corriendo.
     */
    ajustarVelocidad(valor) {
        this.velocidad = parseInt(valor);
        const velocidades = ['Muy lenta', 'Lenta', 'Normal', 'Rápida', 'Muy rápida'];
        const indice = Math.min(4, Math.floor((this.velocidad - 1) / 2));
        document.getElementById('velocidadTexto').textContent = `Velocidad: ${velocidades[indice]}`;

        if (this.simulando) {
            this.pausar();
            this.iniciar();
        }
    }

    /**
     * Ejecuta una iteración completa del planificador simulado.
     */
    cicloSimulacion() {
        this.ciclosCPU++;

        this.admitirNuevosProcesos();

        if (this.produccionAutomatica && Math.random() < this.probabilidadNuevoProceso) {
            this.crearProcesoAleatorio();
        }

        this.procesarEjecucion();
        this.procesarDesbloqueos();
        this.actualizarTiemposEspera();
        this.actualizarVista();
    }

    /**
     * Mueve procesos desde "nuevo" a "listo".
     */
    admitirNuevosProcesos() {
        let admitidos = 0;
        while (this.estados.nuevo.length > 0 && admitidos < 2) {
            const proceso = this.estados.nuevo.shift();
            const estadoAnterior = proceso.estado;
            proceso.estado = 'listo';
            this.estados.listo.push(proceso);
            this.registrarEvento(proceso.id, estadoAnterior, 'listo');
            admitidos++;
        }
    }

    /**
     * Controla ejecución de CPU, finalización y bloqueos.
     */
    procesarEjecucion() {
        if (this.estados.ejecucion.length > 0) {
            const proceso = this.estados.ejecucion[0];

            if (proceso.avanzar()) {
                if (Math.random() < this.probabilidadBloqueo) {
                    this.estados.ejecucion = [];
                    const estadoAnterior = proceso.estado;
                    proceso.estado = 'bloqueado';
                    proceso.vecesBloqueado++;
                    this.estados.bloqueado.push(proceso);
                    this.registrarEvento(proceso.id, estadoAnterior, 'bloqueado');
                } else {
                    this.estados.ejecucion = [];
                    const estadoAnterior = proceso.estado;
                    proceso.estado = 'listo';
                    this.estados.listo.push(proceso);
                    this.registrarEvento(proceso.id, estadoAnterior, 'listo');
                }
            } else {
                this.estados.ejecucion = [];
                const estadoAnterior = proceso.estado;
                proceso.estado = 'terminado';
                this.estados.terminado.push(proceso);
                this.registrarEvento(proceso.id, estadoAnterior, 'terminado');
            }
        }

        if (this.estados.ejecucion.length === 0 && this.estados.listo.length > 0) {
            const proceso = this.estados.listo.shift();
            const estadoAnterior = proceso.estado;
            proceso.estado = 'ejecucion';
            this.estados.ejecucion.push(proceso);
            this.registrarEvento(proceso.id, estadoAnterior, 'ejecucion');
        }
    }

    /**
     * Intenta desbloquear procesos en estado bloqueado.
     */
    procesarDesbloqueos() {
        const nuevosListos = [];
        const nuevosBloqueados = [];

        for (const proceso of this.estados.bloqueado) {
            proceso.tiempoBloqueado++;
            if (Math.random() < 0.2) {
                const estadoAnterior = proceso.estado;
                proceso.estado = 'listo';
                nuevosListos.push(proceso);
                this.registrarEvento(proceso.id, estadoAnterior, 'listo');
            } else {
                nuevosBloqueados.push(proceso);
            }
        }

        this.estados.bloqueado = nuevosBloqueados;
        this.estados.listo.push(...nuevosListos);
    }

    /**
     * Aumenta tiempo de espera para procesos pendientes en cola de listos.
     */
    actualizarTiemposEspera() {
        for (const proceso of this.estados.listo) {
            proceso.tiempoEspera++;
        }
    }

    /**
     * Crea proceso y lo coloca en estado "nuevo".
     */
    crearProceso(nombre, tiempo) {
        const proceso = new Proceso(nombre, tiempo);
        this.procesos.push(proceso);
        this.estados.nuevo.push(proceso);
        this.registrarEvento(proceso.id, 'none', 'nuevo');
        this.actualizarVista();
        return proceso;
    }

    /**
     * Crea proceso manual usando valores del formulario.
     */
    crearProcesoManual() {
        const nombre = document.getElementById('nombreProceso').value || 'Proceso';
        const tiempo = document.getElementById('tiempoProceso').value;
        this.crearProceso(nombre, tiempo);
    }

    /**
     * Crea proceso aleatorio para simular carga variable.
     */
    crearProcesoAleatorio() {
        const nombres = ['System', 'User', 'Browser', 'Editor', 'Game', 'App', 'Service', 'Daemon', 'Process', 'Task'];
        const nombre = nombres[Math.floor(Math.random() * nombres.length)];
        const tiempo = [2, 3, 4, 5, 6, 8][Math.floor(Math.random() * 6)];
        this.crearProceso(nombre, tiempo);
    }

    /**
     * Reinicia por completo el estado del simulador.
     */
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
        this.ciclosCPU = 0;
        Proceso.contadorId = 0;

        this.crearProceso('System', 4);
        this.crearProceso('Explorer', 3);
        this.crearProceso('Chrome', 6);

        document.getElementById('btnIniciar').disabled = false;
        document.getElementById('btnPausar').disabled = true;

        this.actualizarSelectorProcesos();
    }

    /**
     * Refresca columnas y métricas generales.
     */
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
        document.getElementById('ciclosCPU').textContent = this.ciclosCPU;
        document.getElementById('totalEventos').textContent = this.historial.length;
    }

    /**
     * Renderiza una columna de procesos por estado.
     */
    renderizarColumna(elementId, procesos) {
        const contenedor = document.getElementById(elementId);
        if (!contenedor) return;

        contenedor.innerHTML = '';

        procesos.forEach(proceso => {
            const item = document.createElement('div');
            item.className = `proceso-item ${proceso.estado}`;

            const progreso = proceso.getProgreso();

            item.innerHTML = `
                <div class="proceso-header">
                    <span class="proceso-nombre">${proceso.nombre}</span>
                    <span class="proceso-id">#${proceso.id}</span>
                </div>
                <div class="proceso-tiempo">
                    <span>⏱️ ${proceso.tiempoRestante}/${proceso.tiempoTotal}</span>
                    <span>⌛ ${proceso.tiempoEspera}s</span>
                </div>
                <div class="barra-progreso">
                    <div class="progreso" style="width: ${progreso}%"></div>
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
}

/*
 * Instancia global usada por botones y eventos inline del HTML.
 */
const simulador = new SimuladorAutonomo();
