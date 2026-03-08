let idProceso = 1;
const nombresEstado = {
    "nuevo": "Nuevo",
    "listo": "Listo",
    "ejecucion": "En ejecución",
    "espera": "En espera",
    "terminado": "Terminado"
};

const estados = ["nuevo", "listo", "ejecucion", "espera", "terminado"];

function crearProceso() {

    let proceso = document.createElement("li");
    proceso.dataset.nombre = "P" + idProceso;
    idProceso++;

    actualizarTarjetaProceso(proceso, "nuevo");

    document.getElementById("nuevo").appendChild(proceso);
    actualizarResumen();

    setTimeout(() => mover(proceso, "listo"), 2000);
}

function mover(proceso, estado) {

    document.getElementById(estado).appendChild(proceso);
    actualizarTarjetaProceso(proceso, estado);
    actualizarResumen();

    if (estado === "listo") {
        setTimeout(() => mover(proceso, "ejecucion"), 2000);
    }

    else if (estado === "ejecucion") {

        let opcion = Math.random();

        if (opcion < 0.33) {
            setTimeout(() => mover(proceso, "espera"), 2000);
        }

        else if (opcion < 0.66) {
            setTimeout(() => mover(proceso, "listo"), 2000);
        }

        else {
            setTimeout(() => mover(proceso, "terminado"), 2000);
        }

    }

    else if (estado === "espera") {
        setTimeout(() => mover(proceso, "listo"), 3000);
    }

}

function actualizarTarjetaProceso(proceso, estado) {
    proceso.className = "proceso estado-" + estado;
    proceso.innerHTML = "<span class='proceso-id'>" + proceso.dataset.nombre + "</span>" +
        "<span class='proceso-estado'>Estado: " + nombresEstado[estado] + "</span>";
}

function actualizarResumen() {
    let total = idProceso - 1;
    let terminados = document.getElementById("terminado").children.length;
    let activos = total - terminados;

    document.getElementById("resumen").innerText =
        "Total: " + total + " | Activos: " + activos + " | Terminados: " + terminados;

    for (let estado of estados) {
        let contador = document.getElementById("count-" + estado);
        if (contador) {
            contador.innerText = document.getElementById(estado).children.length;
        }
    }
}