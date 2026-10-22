// ==========================================
// UTILIDADES
// ==========================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCIDO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let estado = { lengua: "", palabras: [] };
let indice = { esp: new Map(), ori: new Map() };
let inverso = false;
let secuencia = 0;
let tMinga = null;
let saludado = false;

Minga.config({ palabras: () => estado.palabras, lengua: () => estado.lengua });

function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
}

// Versión para celular: en vez de pedirle datos a un servidor, se usa el almacén local del dispositivo.
const api = (url, opciones = {}) => Almacen.api(url, opciones);

function json(metodo, cuerpo) {
    return { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) };
}

function toast(texto, mal = false) {
    const t = el("div", "toast" + (mal ? " mal" : ""), texto);
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 3600);
}

// Los errores también los cuenta Minga.
function aviso(texto, mal = false) {
    toast(texto, mal);
    if (mal) Minga.decir([texto], { estado: "triste" });
}

function normalizar(t) {
    return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function lista(items) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
}

async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); toast("Copiado ✔"); }
    catch (_) { toast("No se pudo copiar.", true); }
}

// Efecto "descifrando": las letras se van acomodando hasta formar la palabra.
const LETRAS = "abcdefghijklmnñopqrstuvwxyzáéíóú";
function descifrar(nodo, final) {
    nodo.textContent = final;
    if (REDUCIDO || final.length > 40) return;
    let paso = 0;
    const total = 12;
    const id = setInterval(() => {
        paso++;
        const fijo = Math.floor(final.length * paso / total);
        nodo.textContent = [...final].map((c, i) => {
            if (i < fijo || !/\p{L}/u.test(c)) return c;
            const r = LETRAS[Math.floor(Math.random() * LETRAS.length)];
            return c === c.toUpperCase() ? r.toUpperCase() : r;
        }).join("");
        if (paso >= total) { clearInterval(id); nodo.textContent = final; }
    }, 35);
}

// ==========================================
// ÍNDICE LOCAL (para traducir frases)
// ==========================================
function variantes(texto) {
    const partes = String(texto).split(/\s*[\/;]\s*/).map(normalizar).filter(Boolean);
    return new Set([normalizar(texto), ...partes]);
}

function construirIndice() {
    indice = { esp: new Map(), ori: new Map() };
    for (const p of estado.palabras) {
        for (const [campo, mapa] of [["espanol", indice.esp], ["originaria", indice.ori]]) {
            for (const v of variantes(p[campo])) {
                if (!mapa.has(v)) mapa.set(v, []);
                mapa.get(v).push(p);
            }
        }
    }
}

const ARTICULOS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "en", "a", "con", "por", "para", "que", "se", "es", "mi", "tu", "su"]);

function traducirFrase(tokens) {
    const mapa = inverso ? indice.ori : indice.esp;
    const salida = [];
    let i = 0;
    while (i < tokens.length) {
        let hallado = false;
        for (let largo = Math.min(4, tokens.length - i); largo >= 1; largo--) {
            const texto = tokens.slice(i, i + largo).join(" ");
            const entradas = mapa.get(normalizar(texto));
            if (entradas) { salida.push({ texto, entradas }); i += largo; hallado = true; break; }
        }
        if (!hallado) { salida.push({ texto: tokens[i], entradas: null }); i++; }
    }
    return salida;
}

// "¿Cómo se dice árbol en qom?" -> "árbol"
function limpiarConsulta(q) {
    let t = q.replace(/[¿?¡!«»"“”]/g, " ").replace(/\s+/g, " ").trim();
    const orden = /^(?:minga[,\s]+)?(?:c[oó]mo\s+se\s+dice|c[oó]mo\s+digo|c[oó]mo\s+es|traduc[ií]me|traduc[ií]|traduce|dec[ií]me|qu[eé]\s+significa|cu[aá]l\s+es\s+la\s+palabra\s+para)\s+/i;
    if (orden.test(t)) {
        const l = normalizar(estado.lengua).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        t = t.replace(orden, "")
             .replace(/^(?:la|el)\s+(?:palabra|frase)\s+/i, "")
             .replace(/\s+en\s+(?:la\s+)?(?:lengua|idioma)\b.*$/i, "");
        if (l) t = t.replace(new RegExp(`\\s+en\\s+${l}$`, "i"), "");
        t = t.trim();
    }
    return t;
}

// ==========================================
// CARGA INICIAL / ENCABEZADO
// ==========================================
async function cargar() {
    estado = await api("/api/palabras");
    construirIndice();
    pintarEncabezado();
    pintarCategorias();
    pintarGlosario();
    pintarEstadisticas();
    traducir(true);
    if (!saludado) { saludado = true; splashListo.then(() => { enfocar($("#q")); Minga.saludar(); }); }
}

function pintarEncabezado() {
    $("#nombreLengua").textContent = estado.lengua;
    $("#total").textContent = estado.palabras.length;
    $("#lengua").value = estado.lengua;
    actualizarDireccion();
}

function categorias() {
    return [...new Set(estado.palabras.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function pintarCategorias() {
    const cats = categorias();
    $("#categorias").replaceChildren(...cats.map(c => { const o = el("option"); o.value = c; return o; }));
    const sel = $("#filtroCat");
    const actual = sel.value;
    sel.replaceChildren(new Option("Todas las categorías", ""), ...cats.map(c => new Option(c, c)));
    sel.value = cats.includes(actual) ? actual : "";
}

// ==========================================
// PESTAÑAS
// ==========================================
function enfocar(campo) {
    // En celulares no abrimos el teclado solo.
    if (window.matchMedia("(pointer: fine)").matches) campo.focus();
}

function irA(nombre) {
    $$(".tab").forEach(t => t.classList.toggle("activa", t.dataset.tab === nombre));
    $$(".panel").forEach(p => p.classList.toggle("visible", p.id === "tab-" + nombre));
    if (nombre === "traducir") enfocar($("#q"));
    if (nombre === "agregar") enfocar($("#aEsp"));
    if (nombre === "chaco") entrarAlChaco();
}
$$(".tab").forEach(t => t.addEventListener("click", () => irA(t.dataset.tab)));

// ==========================================
// TRADUCIR
// ==========================================
function actualizarDireccion() {
    const l = estado.lengua || "Lengua originaria";
    $("#direccion").textContent = inverso ? `${l} → Español` : `Español → ${l}`;
    $("#q").placeholder = inverso
        ? `Preguntale a Minga… (escribí en ${l})`
        : "Preguntale a Minga: «¿cómo se dice árbol?»";
}

$("#invertir").addEventListener("click", () => {
    inverso = !inverso;
    actualizarDireccion();
    if ($("#q").value.trim()) {
        traducir();
    } else {
        const l = estado.lengua || "la lengua originaria";
        Minga.decir(inverso
            ? ["¡Cambio de sentido! Ahora escribime en ", l, " y te digo qué significa en español."]
            : ["¡Vuelta al principio! Escribime en español y te lo digo en ", l, "."], { estado: "feliz" });
    }
    $("#q").focus();
});

let temporizador;
$("#q").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => traducir(), 150);
});

function pintarInicio() {
    const v = el("div", "vacio");
    v.append(el("span", "icono", "🌿"));
    if (estado.palabras.length === 0) {
        v.append(el("div", "", "Todavía no cargaste palabras."));
        v.append(el("div", "", "Andá a «Agregar» o «Datos» para cargar tu glosario."));
    } else {
        v.append(el("div", "", "Escribí una palabra para ver su traducción."));
    }
    $("#resultado").replaceChildren(v);
}

function ensenar(texto) {
    irA("agregar");
    $("#aEsp").value = inverso ? "" : texto;
    $("#aOri").value = inverso ? texto : "";
    (inverso ? $("#aEsp") : $("#aOri")).focus();
    Minga.decir(inverso
        ? ["¡Dale! Decime qué significa «", texto, "» en español y lo guardo."]
        : ["¡Dale! Decime cómo se dice «", texto, "» en ", estado.lengua || "la lengua originaria", " y lo guardo."],
        { estado: "saludo" });
}

function programarMinga(fn) {
    Minga.pensar();
    clearTimeout(tMinga);
    tMinga = setTimeout(fn, 650);
}

function pintarFrase(fr) {
    const caja = $("#resultado");
    caja.replaceChildren(el("div", "sim-titulo", "Traducción palabra por palabra"));
    const fila = el("div", "frase");
    fr.forEach(x => {
        const esArticulo = ARTICULOS.has(normalizar(x.texto));
        const f = el("div", "ficha" + (x.entradas ? "" : esArticulo ? " articulo" : " desconocida"));
        f.append(el("small", "", x.texto));
        if (x.entradas) {
            const p = x.entradas[0];
            const b = el("b");
            descifrar(b, inverso ? p.espanol : p.originaria);
            f.append(b);
            if (x.entradas.length > 1) f.append(el("small", "", `+${x.entradas.length - 1} más`));
        } else {
            f.append(el("b", "", "?"));
            if (!esArticulo) {
                f.title = "Tocá para enseñármela";
                f.addEventListener("click", () => ensenar(x.texto));
            }
        }
        fila.append(f);
    });
    caja.append(fila);
}

function respuestaFrase(fr) {
    const faltan = fr.filter(x => !x.entradas && !ARTICULOS.has(normalizar(x.texto))).map(x => x.texto);
    programarMinga(() => {
        if (!faltan.length) {
            Minga.decir(["¡Listo! Armé la frase palabra por palabra. Ojo: en la lengua originaria el orden puede cambiar, tomalo como un puente."],
                { estado: "feliz", mantener: 7000 });
        } else {
            Minga.decir(["Traduje lo que sé, pero no conozco ", lista(faltan.map(f => `«${f}»`)), ". ¿Me ", faltan.length > 1 ? "las" : "la", " enseñás?"],
                { estado: "duda", mantener: 8000, acciones: [{ texto: `➕ Enseñarle «${faltan[0]}»`, fn: () => ensenar(faltan[0]) }] });
        }
    });
}

function respuestaMinga(q, d) {
    const destino = p => inverso ? p.espanol : p.originaria;
    programarMinga(() => {
        if (d.exactas.length === 1) {
            const p = d.exactas[0];
            const apertura = ["¡La encontré!", "¡Acá está!", "¡Eso lo sé!"][Math.floor(Math.random() * 3)];
            const partes = inverso
                ? [`${apertura} «`, p.originaria, "» significa ", { b: destino(p) }, p.nota ? ` (${p.nota}).` : "."]
                : [`${apertura} «`, p.espanol, "» se dice ", { b: destino(p) }, p.nota ? ` (${p.nota}).` : "."];
            Minga.decir(partes, { estado: "feliz", mantener: 7000, acciones: [
                p.audio ? { texto: "🔊 Escuchar", fn: () => Voz.reproducir(p, null, e => toast(e, true)) }
                        : { texto: "🎙️ Agregar voz", fn: () => grabarVozDe(p) },
                ...(p.audio ? [] : [{ texto: "📁 Sonido externo", fn: () => grabarVozDe(p, { abrirArchivo: true }) }]),
                { texto: "📋 Copiar", fn: () => copiar(destino(p)) }] });
        } else if (d.exactas.length > 1) {
            const partes = [`«${q}» tiene ${d.exactas.length} formas: `];
            d.exactas.forEach((p, i) => {
                if (i > 0) partes.push(i === d.exactas.length - 1 ? " y " : ", ");
                partes.push({ b: destino(p) });
            });
            partes.push(".");
            Minga.decir(partes, { estado: "feliz", mantener: 7000 });
        } else {
            const acciones = [{ texto: `➕ Enseñarle «${q}»`, fn: () => ensenar(q) }];
            d.similares.slice(0, 3).forEach(p => {
                const a = inverso ? p.originaria : p.espanol;
                acciones.push({ texto: a, fn: () => { $("#q").value = a; traducir(); } });
            });
            Minga.decir(d.similares.length
                ? ["Mmm, no tengo «", q, "» tal cual, pero me suenan parecidas. ¿Será alguna de estas?"]
                : ["No conozco «", q, "» todavía. ¿Me la enseñás?"],
                { estado: "duda", mantener: 9000, acciones });
        }
    });
}

async function traducir(silencioso = false) {
    const crudo = $("#q").value.trim();
    clearTimeout(tMinga);
    if (!crudo) {
        pintarInicio();
        if (!silencioso) Minga.decir(["¿Qué palabra buscamos?"], { estado: "neutral" });
        return;
    }
    const q = limpiarConsulta(crudo) || crudo;
    if (!silencioso) Minga.pensar();

    const mia = ++secuencia;
    let d;
    try {
        d = await api(`/api/traducir?q=${encodeURIComponent(q)}&inverso=${inverso ? 1 : 0}`);
    } catch (e) { return aviso(e.message, true); }
    if (mia !== secuencia) return; // llegó una respuesta más nueva

    // ¿Es una frase? Se arma palabra por palabra.
    const tokens = q.split(/[\s,;.:()]+/).filter(Boolean);
    if (d.exactas.length === 0 && tokens.length >= 2) {
        const fr = traducirFrase(tokens);
        if (fr.some(x => x.entradas)) {
            pintarFrase(fr);
            if (!silencioso) respuestaFrase(fr);
            return;
        }
    }

    const caja = $("#resultado");
    caja.replaceChildren();

    d.exactas.forEach(p => {
        const res = el("div", "res");
        const izq = el("div");
        const origen = el("div", "origen");
        origen.append(inverso ? p.originaria : p.espanol);
        const dest = el("div", "destino");
        descifrar(dest, inverso ? p.espanol : p.originaria);
        const filaDest = el("div", "fila-destino");
        filaDest.append(dest);
        // la voz siempre es la de la palabra en lengua originaria: va junto a ella
        if (inverso) origen.append(botonVoz(p)); else filaDest.append(botonVoz(p));
        izq.append(origen, filaDest);
        if (p.categoria || p.nota) {
            const chips = el("div", "chips");
            if (p.categoria) chips.append(el("span", "chip", p.categoria));
            if (p.nota) chips.append(el("span", "chip nota", p.nota));
            izq.append(chips);
        }
        const b = el("button", "copiar", "📋");
        b.title = "Copiar traducción";
        b.addEventListener("click", () => copiar(inverso ? p.espanol : p.originaria));
        const acc = el("div", "res-acciones");
        if (p.audio) {
            const bv = el("button", "copiar", "🎙️");
            bv.title = "Cambiar la voz";
            bv.addEventListener("click", () => grabarVozDe(p));
            acc.append(bv);
        }
        acc.append(b);
        res.append(izq, acc);
        caja.append(res);
    });

    if (d.exactas.length === 0) {
        const v = el("div", "vacio");
        v.append(el("span", "icono", "🔍"));
        v.append(el("div", "", `No encontramos «${q}» en el glosario.`));
        const b = el("button", "btn btn-agregar-rapido", "➕ Agregar esta palabra");
        b.addEventListener("click", () => ensenar(q));
        v.append(b);
        caja.append(v);
    }

    if (d.similares.length) {
        caja.append(el("div", "sim-titulo", "Palabras parecidas"));
        const sim = el("div", "sim");
        d.similares.forEach(p => {
            const b = el("button");
            const a = inverso ? p.originaria : p.espanol;
            const c = inverso ? p.espanol : p.originaria;
            b.append(a + " ", el("em", "", "→ " + c));
            b.addEventListener("click", () => { $("#q").value = a; traducir(); });
            sim.append(b);
        });
        caja.append(sim);
    }

    if (!silencioso) respuestaMinga(q, d);
}

// ==========================================
// AGREGAR
// ==========================================
$("#formAgregar").addEventListener("submit", async e => {
    e.preventDefault();
    const esp = $("#aEsp").value.trim(), ori = $("#aOri").value.trim();
    try {
        const r = await api("/api/palabras", json("POST", {
            espanol: esp, originaria: ori, categoria: $("#aCat").value, nota: $("#aNota").value,
        }));
        $("#aEsp").value = ""; $("#aOri").value = ""; $("#aNota").value = "";
        $("#aEsp").focus();
        let conVoz = false;
        if (vozPendiente) {
            try {
                await api(`/api/audio/${r.palabra.id}`, { method: "PUT", headers: { "Content-Type": vozPendiente.mime }, body: vozPendiente.blob });
                conVoz = true;
            } catch (e) { toast("La palabra se guardó, pero la voz no: " + e.message, true); }
            vozPendiente = null;
            actualizarVozPendiente();
        }
        await cargar();
        toast("Palabra guardada ✔");
        const hito = [10, 50, 100, 500, 1000].includes(r.total) ? ` ¡Ya son ${r.total}!` : "";
        Minga.decir(["¡Gracias! Aprendí que «", esp, "» se dice ", { b: ori }, `${conVoz ? ", y también cómo suena" : ""}. Ahora conozco ${r.total} palabra${r.total === 1 ? "" : "s"}.${hito}`],
            { estado: "feliz", mantener: 7000 });
    } catch (err) { aviso(err.message, true); }
});

function resultadoImportacion(r) {
    let t = `${r.agregadas} agregada(s)`;
    if (r.repetidas) t += `, ${r.repetidas} repetida(s)`;
    if (r.invalidas) t += `, ${r.invalidas} sin completar`;
    toast(t + ".", r.agregadas === 0 && (r.invalidas || !r.repetidas));
    if (r.agregadas > 0) {
        Minga.decir([`¡Guau! Aprendí ${r.agregadas} palabra${r.agregadas === 1 ? "" : "s"} nueva${r.agregadas === 1 ? "" : "s"}. Ahora conozco ${r.total}.`],
            { estado: "feliz", mantener: 7000 });
    } else {
        Minga.decir([r.repetidas ? "No aprendí nada nuevo: esas palabras ya las conocía." : "No pude aprender nada de eso. Revisá que cada línea tenga la palabra y su traducción."],
            { estado: "duda" });
    }
}

$("#btnMasivo").addEventListener("click", async () => {
    const texto = $("#masivo").value;
    if (!texto.trim()) return aviso("Pegá al menos una línea.", true);
    const fd = new FormData();
    fd.append("texto", texto);
    try {
        const r = await api("/api/importar", { method: "POST", body: fd });
        $("#masivo").value = "";
        await cargar();
        resultadoImportacion(r);
    } catch (err) { aviso(err.message, true); }
});

// ==========================================
// GLOSARIO (listado, editar, borrar)
// ==========================================
function pintarGlosario() {
    const f = normalizar($("#filtro").value);
    const cat = $("#filtroCat").value;
    const filtradas = estado.palabras.filter(p =>
        (!cat || p.categoria === cat) &&
        (!f || normalizar(p.espanol).includes(f) || normalizar(p.originaria).includes(f)));
    const LIMITE = 1000;
    $("#cuenta").textContent = estado.palabras.length === 0
        ? "El glosario está vacío."
        : `Mostrando ${Math.min(filtradas.length, LIMITE)} de ${filtradas.length} palabra(s).`;

    $("#lista").replaceChildren(...filtradas.slice(0, LIMITE).map(p => {
        const fila = el("div", "item");
        const txt = el("div");
        txt.append(el("span", "esp", p.espanol), el("span", "ori", p.originaria));
        if (p.categoria || p.nota) {
            const chips = el("div", "chips");
            if (p.categoria) chips.append(el("span", "chip", p.categoria));
            if (p.nota) chips.append(el("span", "chip nota", p.nota));
            txt.append(chips);
        }
        const acc = el("div", "acciones");
        const be = el("button", "", "✏️"); be.title = "Editar";
        const bb = el("button", "", "🗑️"); bb.title = "Borrar";
        be.addEventListener("click", () => abrirEditar(p));
        bb.addEventListener("click", () => borrar(p));
        const bv = el("button", "", "🎙️"); bv.title = p.audio ? "Cambiar la voz" : "Grabar la voz";
        bv.addEventListener("click", () => grabarVozDe(p));
        if (p.audio) {
            const bs = el("button", "", "🔊"); bs.title = "Escuchar";
            bs.addEventListener("click", () => Voz.reproducir(p, bs, e => toast(e, true)));
            acc.append(bs);
        }
        acc.append(bv, be, bb);
        fila.append(txt, acc);
        return fila;
    }));
}
$("#filtro").addEventListener("input", pintarGlosario);
$("#filtroCat").addEventListener("change", pintarGlosario);

let editandoId = null;
function abrirEditar(p) {
    editandoId = p.id;
    $("#eEsp").value = p.espanol; $("#eOri").value = p.originaria;
    $("#eCat").value = p.categoria; $("#eNota").value = p.nota;
    $("#dlgEditar").showModal();
}
$("#cancelarEditar").addEventListener("click", () => $("#dlgEditar").close());
$("#formEditar").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        await api(`/api/palabras/${editandoId}`, json("PUT", {
            espanol: $("#eEsp").value, originaria: $("#eOri").value,
            categoria: $("#eCat").value, nota: $("#eNota").value,
        }));
        $("#dlgEditar").close();
        await cargar();
        toast("Cambios guardados ✔");
        Minga.decir(["¡Corregido! Gracias por enseñarme mejor."], { estado: "feliz", mantener: 4000 });
    } catch (err) { aviso(err.message, true); }
});

async function borrar(p) {
    if (!confirm(`¿Borrar «${p.espanol} → ${p.originaria}»?`)) return;
    try {
        await api(`/api/palabras/${p.id}`, { method: "DELETE" });
        await cargar();
        toast("Palabra borrada.");
        Minga.decir(["Listo, me olvidé de «", p.espanol, "».", " Ahora conozco ", String(estado.palabras.length), "."], { estado: "neutral" });
    } catch (err) { aviso(err.message, true); }
}

// ==========================================
// DATOS (importar / lengua)
// ==========================================
$("#btnImportar").addEventListener("click", async () => {
    const archivo = $("#archivo").files[0];
    if (!archivo) return aviso("Elegí un archivo primero.", true);
    if ($("#reemplazar").checked && !confirm("Esto borra el glosario actual y lo reemplaza por el archivo. ¿Seguir?")) return;
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("reemplazar", $("#reemplazar").checked ? "1" : "0");
    try {
        const r = await api("/api/importar", { method: "POST", body: fd });
        $("#archivo").value = ""; $("#reemplazar").checked = false;
        await cargar();
        resultadoImportacion(r);
    } catch (err) { aviso(err.message, true); }
});

$("#formLengua").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/api/config", json("PUT", { lengua: $("#lengua").value }));
        await cargar();
        toast("Nombre guardado ✔");
        Minga.decir(["¡Anotado! Desde ahora trabajamos con ", { b: r.lengua }, "."], { estado: "feliz", mantener: 5000 });
    } catch (err) { aviso(err.message, true); }
});

// ==========================================
// EXPORTAR
// ==========================================
$$(".exp").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
        const r = await api("/api/exportar/guardar", json("POST", { formato: b.dataset.exp }));
        $("#exportadoTexto").textContent = `✅ Guardado en: ${r.ruta}`;
        $("#exportado").hidden = false;
        toast(`Exportado: ${r.nombre}`);
        Minga.decir([`¡Listo! Guardé ${r.cantidad} palabra${r.cantidad === 1 ? "" : "s"} en ${r.nombre}, dentro de tu carpeta Descargas.`],
            { estado: "feliz", mantener: 7000 });
    } catch (err) { aviso(err.message, true); }
    finally { b.disabled = false; }
}));

$("#abrirCarpeta").addEventListener("click", async () => {
    try { await api("/api/exportar/abrir", { method: "POST" }); }
    catch (err) { aviso(err.message, true); }
});

// ==========================================
// VOZ
// ==========================================
let vozPendiente = null;   // grabación hecha en «Agregar», que se sube cuando se guarda la palabra

// Botón que va junto a la traducción: escuchar (si hay voz) o agregarla.
function botonVoz(p) {
    if (p.audio) {
        const b = el("button", "voz-play", "🔊");
        b.type = "button";
        b.title = `Escuchar cómo se dice «${p.originaria}»`;
        b.addEventListener("click", () => Voz.reproducir(p, b, e => toast(e, true)));
        return b;
    }
    const grupo = el("span", "voz-grupo");
    const b = el("button", "voz-agregar", "🎙️ Agregar voz");
    b.type = "button";
    b.title = "Grabar cómo se pronuncia";
    b.addEventListener("click", () => grabarVozDe(p));
    const x = el("button", "voz-externo", "📁 Sonido externo");
    x.type = "button";
    x.title = "Elegir un archivo de sonido de tu teléfono";
    x.addEventListener("click", () => grabarVozDe(p, { abrirArchivo: true }));
    grupo.append(b, x);
    return grupo;
}

function grabarVozDe(p, { abrirArchivo = false } = {}) {
    Voz.grabar({
        abrirArchivo,
        titulo: `Voz de «${p.originaria}»`,
        existente: !!p.audio,
        alGuardar: async (blob, mime) => {
            await api(`/api/audio/${p.id}`, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
            await cargar();
            toast("Voz guardada ✔");
            Minga.decir(["¡Qué linda voz! Ya sé cómo suena «", p.originaria, "». Tocá 🔊 para escucharla."],
                { estado: "feliz", mantener: 6000, acciones: [{ texto: "🔊 Escuchar", fn: () => Voz.reproducir(p, null, e => toast(e, true)) }] });
        },
        alEliminar: async () => {
            await api(`/api/audio/${p.id}`, { method: "DELETE" });
            await cargar();
            toast("Voz eliminada.");
            Minga.decir(["Listo, borré la voz de «", p.originaria, "»."], { estado: "neutral" });
        },
    });
}

function actualizarVozPendiente() {
    const chip = $("#aVozEstado");
    chip.hidden = !vozPendiente;
    chip.replaceChildren();
    $("#aVoz").textContent = vozPendiente ? "🎙️ Grabar de nuevo" : "🎙️ Grabar voz (opcional)";
    if (vozPendiente) {
        const quitar = el("button", "btn-chico", "Quitar");
        quitar.type = "button";
        quitar.addEventListener("click", () => { vozPendiente = null; actualizarVozPendiente(); });
        chip.append("✅ Voz lista ", quitar);
    }
}

function abrirVozPendiente(abrirArchivo) {
    Voz.grabar({
        abrirArchivo,
        titulo: `Voz de «${$("#aOri").value.trim() || "la palabra"}»`,
        existente: false,
        alGuardar: async (blob, mime) => { vozPendiente = { blob, mime }; actualizarVozPendiente(); },
        alEliminar: async () => {},
    });
}
$("#aVoz").addEventListener("click", () => abrirVozPendiente(false));
$("#aVozExterno").addEventListener("click", () => abrirVozPendiente(true));

// ==========================================
// REDES SOCIALES (pie de página)
// ==========================================
$$(".red-social").forEach(a => a.addEventListener("click", async e => {
    e.preventDefault();   // dentro de la ventana de la app, el sistema abre el navegador
    try { await api("/api/redes/abrir", json("POST", { red: a.dataset.red })); }
    catch (_) { window.open(a.href, "_blank", "noopener"); }
}));

// ==========================================
// LA WIPHALA
// ==========================================
$("#banderaCab").addEventListener("click", () => {
    Minga.decir(["Esta es la ", { b: "Wiphala" }, ", símbolo de los pueblos originarios de los Andes. Sus cuadros de colores representan la diversidad y la unidad entre los pueblos. ¡Y flamea en tu proyecto!"],
        { estado: "feliz", mantener: 8000 });
});

// ==========================================
// EL CHACO (mapa interactivo + estadísticas)
// ==========================================
const COLORES_BARRA = ["#d62828", "#ee7d22", "#e0b400", "#2b8f3a", "#2352b5", "#6b3a72"];

function pintarEstadisticas() {
    const cont = $("#estadisticas");
    if (!cont) return;
    const ps = estado.palabras;
    const conteo = new Map();
    ps.forEach(p => { const c = p.categoria || "sin categoría"; conteo.set(c, (conteo.get(c) || 0) + 1); });
    const porEsp = new Map();
    ps.forEach(p => porEsp.set(normalizar(p.espanol), (porEsp.get(normalizar(p.espanol)) || 0) + 1));
    const variasFormas = [...porEsp.values()].filter(n => n > 1).length;

    const numeros = el("div", "numeros");
    [[ps.length, "palabras"], [conteo.size, "categorías"], [variasFormas, "con varias formas"], [ps.filter(p => p.audio).length, "con voz"]].forEach(([n, t]) => {
        const caja = el("div", "numero");
        caja.append(el("strong", "", String(n)), el("span", "", t));
        numeros.append(caja);
    });

    const barras = el("div", "barras");
    const orden = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
    const maximo = orden.length ? orden[0][1] : 1;
    orden.forEach(([nombre, n], i) => {
        const fila = el("div", "barra-fila");
        const pista = el("div", "barra-pista");
        const relleno = el("div", "barra-relleno");
        relleno.style.background = COLORES_BARRA[i % COLORES_BARRA.length];
        relleno.dataset.ancho = String(Math.max(4, Math.round(n / maximo * 100)));
        pista.append(relleno);
        fila.append(el("div", "nom", nombre), pista, el("div", "cant", String(n)));
        barras.append(fila);
    });
    cont.replaceChildren(numeros, ps.length ? barras : el("p", "ayuda", "Cuando cargues palabras, acá vas a ver cuántas hay en cada categoría."));
    animarBarras();
}

function animarBarras() {
    $$(".barra-relleno").forEach(r => { r.style.width = "0"; });
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $$(".barra-relleno").forEach(r => { r.style.width = r.dataset.ancho + "%"; });
    }));
}

function entrarAlChaco() {
    animarBarras();
    Minga.decir(["¡Bienvenido al ", { b: "Chaco" }, "! De esta tierra vienen las palabras de tu glosario. Tocá el mapa y te cuento una."],
        { estado: "saludo", mantener: 6000 });
}

const escena = $("#mapaEscena");
escena.addEventListener("pointermove", e => {
    const r = escena.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    escena.style.setProperty("--ry", ((x - .5) * 22).toFixed(1) + "deg");
    escena.style.setProperty("--rx", ((.5 - y) * 18).toFixed(1) + "deg");
    escena.style.setProperty("--mx", (x * 100).toFixed(0) + "%");
    escena.style.setProperty("--my", (y * 100).toFixed(0) + "%");
});
escena.addEventListener("pointerleave", () => {
    ["--rx", "--ry"].forEach(v => escena.style.setProperty(v, "0deg"));
});
escena.addEventListener("click", e => {
    const r = escena.getBoundingClientRect();
    const onda = el("span", "onda-click");
    onda.style.left = (e.clientX - r.left) + "px";
    onda.style.top = (e.clientY - r.top) + "px";
    escena.append(onda);
    setTimeout(() => onda.remove(), 850);
    Minga.palabraDelDia();
});
$("#mapaPalabra").addEventListener("click", () => Minga.palabraDelDia());

// ==========================================
// VERSIÓN PROTEGIDA: sin menú contextual ni atajos de inspección
// ==========================================
if (document.querySelector('meta[name="proteccion"]')) {
    document.addEventListener("contextmenu", e => e.preventDefault());
    document.addEventListener("keydown", e => {
        const k = e.key.toLowerCase();
        if (e.key === "F12" || (e.ctrlKey && (k === "u" || k === "s" || (e.shiftKey && ["i", "j", "c"].includes(k))))) e.preventDefault();
    });
}

cargar();
