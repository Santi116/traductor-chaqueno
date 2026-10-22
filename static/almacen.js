// ==========================================
// ALMACÉN LOCAL (versión para celular / PWA)
// Reemplaza al servidor de Python: guarda el glosario y las voces en el propio dispositivo
// (IndexedDB) y responde a las mismas "rutas" que usa la pantalla (/api/...).
// Proyecto de Santiago Agustín Gómez · © 2026
// ==========================================
const Almacen = (() => {
    const NOMBRE_BD = "traductor-chaqueno";
    const LENGUA_POR_DEFECTO = "Lengua originaria del Chaco";
    const MAX_AUDIO = 4 * 1024 * 1024;
    const CABECERAS = new Set(["espanol", "spanish", "castellano", "palabra"]);
    let bd = null;

    // ---------- utilidades (iguales a las de app.py) ----------
    const norm = t => String(t == null ? "" : t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const limpiar = (t, max) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, max);
    const variantes = t => {
        const s = new Set([norm(t)]);
        String(t == null ? "" : t).split(/\s*[\/;]\s*/).forEach(p => { if (p.trim()) s.add(norm(p)); });
        return s;
    };
    const nuevoId = () => [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, "0")).join("");
    const entrada = (esp, ori, cat, nota) => ({ id: nuevoId(), espanol: limpiar(esp, 200), originaria: limpiar(ori, 200), categoria: limpiar(cat, 60), nota: limpiar(nota, 500), audio: "" });
    const clave = p => norm(p.espanol) + "\u0000" + norm(p.originaria);
    const ordenadas = ps => [...ps].sort((a, b) => {
        const x = norm(a.espanol) + "\u0001" + norm(a.originaria), y = norm(b.espanol) + "\u0001" + norm(b.originaria);
        return x < y ? -1 : x > y ? 1 : 0;
    });

    // ---------- base de datos ----------
    const pedir = rq => new Promise((ok, mal) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => mal(rq.error); });
    const terminar = t => new Promise((ok, mal) => { t.oncomplete = () => ok(); t.onerror = () => mal(t.error); t.onabort = () => mal(t.error); });
    const abrirBD = () => new Promise((ok, mal) => {
        const r = indexedDB.open(NOMBRE_BD, 1);
        r.onupgradeneeded = () => {
            const d = r.result;
            d.createObjectStore("palabras", { keyPath: "id" });
            d.createObjectStore("audios", { keyPath: "id" });
            d.createObjectStore("meta", { keyPath: "clave" });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
    });
    const leerPalabras = async () => (await pedir(bd.transaction("palabras").objectStore("palabras").getAll())).sort((a, b) => (a.n || 0) - (b.n || 0));
    const leerConfig = async () => (await pedir(bd.transaction("meta").objectStore("meta").get("config"))) || null;
    const publicas = ps => ps.map(({ n, ...resto }) => resto);

    const listo = (async () => {
        bd = await abrirBD();
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        if (!(await leerConfig())) {   // primera vez: se carga el glosario de arranque
            let inicial = { lengua: LENGUA_POR_DEFECTO, palabras: [] };
            try { const r = await fetch("glosario_inicial.json"); if (r.ok) inicial = await r.json(); } catch (_) {}
            const t = bd.transaction(["palabras", "meta"], "readwrite");
            (inicial.palabras || []).forEach((p, i) => t.objectStore("palabras").put({
                id: p.id || nuevoId(), espanol: p.espanol, originaria: p.originaria, categoria: p.categoria || "", nota: p.nota || "", audio: "", n: i + 1 }));
            t.objectStore("meta").put({ clave: "config", lengua: inicial.lengua || LENGUA_POR_DEFECTO });
            await terminar(t);
        }
    })();

    // ---------- importación (CSV / TXT / JSON) ----------
    function partirLinea(linea, delim) {
        const campos = []; let actual = "", entre = false;
        for (let i = 0; i < linea.length; i++) {
            const c = linea[i];
            if (entre) {
                if (c === '"') { if (linea[i + 1] === '"') { actual += '"'; i++; } else entre = false; } else actual += c;
            } else if (c === '"' && actual === "") entre = true;
            else if (c === delim) { campos.push(actual); actual = ""; }
            else actual += c;
        }
        campos.push(actual);
        return campos;
    }
    function filasDesdeTexto(texto) {
        const lineas = texto.split(/\r\n|\r|\n/).filter(l => l.trim() && !l.trimStart().startsWith("#"));
        let delim = null, mejor = 0;
        for (const d of ["\t", ";", "|", "=", ":", ","]) {
            const n = lineas.filter(l => l.includes(d)).length;
            if (n > mejor) { mejor = n; delim = d; }
        }
        if (delim === null) return [];
        let filas = lineas.map(l => {
            let cols;
            if (delim === "=" || delim === ":") { const i = l.indexOf(delim); cols = i < 0 ? [l] : [l.slice(0, i), l.slice(i + 1)]; }
            else cols = partirLinea(l, delim);
            cols = cols.map(c => c.trim()).concat(["", "", "", ""]);
            return [cols[0], cols[1], cols[2], cols[3]];
        });
        if (filas.length && CABECERAS.has(norm(filas[0][0]))) filas = filas.slice(1);
        return filas;
    }
    function filasDesdeJson(data) {
        if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.palabras)) data = data.palabras;
        const filas = [];
        if (Array.isArray(data)) {
            for (const it of data) {
                if (it && typeof it === "object" && !Array.isArray(it)) {
                    const n = {};
                    for (const [k, v] of Object.entries(it)) n[norm(k)] = v;
                    filas.push([n.espanol || n.spanish || n.palabra || "", n.originaria || n.traduccion || n.translation || n.lengua || "", n.categoria || "", n.nota || ""]);
                } else if (Array.isArray(it)) {
                    const c = it.concat(["", "", "", ""]);
                    filas.push([c[0], c[1], c[2], c[3]]);
                }
            }
        } else if (data && typeof data === "object") {
            for (const [k, v] of Object.entries(data)) filas.push([k, v, "", ""]);
        }
        return filas;
    }
    async function textoDeArchivo(archivo) {
        const buf = await archivo.arrayBuffer(), b = new Uint8Array(buf);
        if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(buf).replace(/^\uFEFF/, "");
        if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(buf).replace(/^\uFEFF/, "");
        try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, ""); }
        catch (_) { return new TextDecoder("windows-1252").decode(buf); }
    }

    // ---------- sonido: tipo real según los primeros bytes (igual que app.py) ----------
    function tipoDeAudio(c) {
        const t = (i, s) => [...s].every((ch, k) => c[i + k] === ch.charCodeAt(0));
        if (c[0] === 0x1A && c[1] === 0x45 && c[2] === 0xDF && c[3] === 0xA3) return "audio/webm";
        if (t(0, "OggS")) return "audio/ogg";
        if (t(0, "RIFF") && t(8, "WAVE")) return "audio/wav";
        if (t(0, "fLaC")) return "audio/flac";
        if (t(4, "ftyp")) return "audio/mp4";
        if (t(0, "ID3")) return "audio/mpeg";
        if (c.length > 2 && c[0] === 0xFF && (c[1] & 0xF6) === 0xF0) return "audio/aac";
        if (c.length > 2 && c[0] === 0xFF && (c[1] & 0xE0) === 0xE0) return "audio/mpeg";
        return null;
    }

    // ---------- guardar un archivo en el dispositivo ----------
    async function guardarArchivo(blob, nombre) {
        const cap = window.Capacitor;
        if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
            // App de Android (Capacitor): se escribe el archivo y se abre «Compartir / Guardar en…»
            const base64 = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = mal; r.readAsDataURL(blob); });
            const res = await cap.Plugins.Filesystem.writeFile({ path: nombre, data: base64, directory: "CACHE" });
            await cap.Plugins.Share.share({ title: nombre, url: res.uri, dialogTitle: "Guardar o compartir el glosario" });
            return "Compartir";
        }
        const url = URL.createObjectURL(blob);   // navegador / PWA: descarga a la carpeta Descargas
        const a = document.createElement("a");
        a.href = url; a.download = nombre;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        return "Descargas";
    }

    // ---------- operaciones (mismas respuestas que la API de Python) ----------
    async function listar() {
        const [c, ps] = [await leerConfig(), await leerPalabras()];
        return { lengua: c.lengua, palabras: publicas(ordenadas(ps)) };
    }
    async function traducir(q, inverso) {
        const nq = norm(q);
        if (!nq) return { exactas: [], similares: [] };
        const campo = inverso ? "originaria" : "espanol";
        const exactas = [], empieza = [], contiene = [];
        for (const p of await leerPalabras()) {
            const vs = [...variantes(p[campo])];
            if (vs.includes(nq)) exactas.push(p);
            else if (vs.some(v => v.startsWith(nq))) empieza.push(p);
            else if (nq.length >= 2 && vs.some(v => v.includes(nq))) contiene.push(p);
        }
        return { exactas: publicas(exactas), similares: publicas(empieza.concat(contiene)).slice(0, 12) };
    }
    async function agregar(d) {
        const e = entrada(d.espanol, d.originaria, d.categoria, d.nota);
        if (!e.espanol || !e.originaria) throw new Error("Completá la palabra en español y su traducción.");
        const ps = await leerPalabras();
        if (ps.some(p => clave(p) === clave(e))) throw new Error("Esa palabra con esa traducción ya está en el glosario.");
        e.n = ps.reduce((m, p) => Math.max(m, p.n || 0), 0) + 1;
        const t = bd.transaction("palabras", "readwrite"); t.objectStore("palabras").put(e); await terminar(t);
        const { n, ...sinN } = e;
        return { palabra: sinN, total: ps.length + 1 };
    }
    async function editar(id, d) {
        const nuevo = entrada(d.espanol, d.originaria, d.categoria, d.nota);
        if (!nuevo.espanol || !nuevo.originaria) throw new Error("Completá la palabra en español y su traducción.");
        const p = await pedir(bd.transaction("palabras").objectStore("palabras").get(id));
        if (!p) throw new Error("No se encontró la palabra.");
        Object.assign(p, { espanol: nuevo.espanol, originaria: nuevo.originaria, categoria: nuevo.categoria, nota: nuevo.nota });
        const t = bd.transaction("palabras", "readwrite"); t.objectStore("palabras").put(p); await terminar(t);
        return { palabra: publicas([p])[0] };
    }
    async function borrar(id) {
        const p = await pedir(bd.transaction("palabras").objectStore("palabras").get(id));
        if (!p) throw new Error("No se encontró la palabra.");
        const t = bd.transaction(["palabras", "audios"], "readwrite");
        t.objectStore("palabras").delete(id); t.objectStore("audios").delete(id);
        await terminar(t);
        return { ok: true, total: (await leerPalabras()).length };
    }
    async function configurar(d) {
        const lengua = limpiar(d.lengua, 60) || LENGUA_POR_DEFECTO;
        const t = bd.transaction("meta", "readwrite"); t.objectStore("meta").put({ clave: "config", lengua }); await terminar(t);
        return { lengua };
    }
    async function importar(fd) {
        let texto = fd.get("texto"), nombre = "texto.txt";
        if (texto === null) {
            const archivo = fd.get("archivo");
            if (!archivo || !archivo.name) throw new Error("Elegí un archivo para importar.");
            if (archivo.size > 5 * 1024 * 1024) throw new Error("El archivo es demasiado grande (máximo 5 MB).");
            nombre = archivo.name.toLowerCase();
            texto = await textoDeArchivo(archivo);
        }
        let filas;
        try { filas = nombre.endsWith(".json") ? filasDesdeJson(JSON.parse(texto)) : filasDesdeTexto(texto); }
        catch (_) { throw new Error("El archivo JSON no es válido."); }
        const reemplazar = fd.get("reemplazar") === "1";
        let existentes = reemplazar ? [] : await leerPalabras();
        const claves = new Set(existentes.map(clave));
        let n = existentes.reduce((m, p) => Math.max(m, p.n || 0), 0);
        let agregadas = 0, repetidas = 0, invalidas = 0;
        const t = bd.transaction(["palabras", "audios"], "readwrite");
        if (reemplazar) { t.objectStore("palabras").clear(); t.objectStore("audios").clear(); }
        for (const [esp, ori, cat, nota] of filas) {
            const e = entrada(esp, ori, cat, nota);
            if (!e.espanol || !e.originaria) { invalidas++; continue; }
            if (claves.has(clave(e))) { repetidas++; continue; }
            claves.add(clave(e)); e.n = ++n; t.objectStore("palabras").put(e); agregadas++;
        }
        await terminar(t);
        return { agregadas, repetidas, invalidas, total: claves.size };
    }
    async function exportar(formato) {
        if (!["xlsx", "txt", "csv", "json"].includes(formato)) throw new Error("Formato no válido.");
        const [c, ps0] = [await leerConfig(), await leerPalabras()];
        const ps = publicas(ordenadas(ps0));
        if (!ps.length) throw new Error("Todavía no hay palabras para exportar.");
        let blob;
        if (formato === "xlsx") blob = new Blob([XLSX.generar(c.lengua, ps)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        else if (formato === "json") blob = new Blob([JSON.stringify({ lengua: c.lengua, palabras: ps }, null, 2)], { type: "application/json" });
        else if (formato === "txt") {
            const lineas = [`# Glosario - ${c.lengua}`, "# Exportado con Traductor Chaqueño - proyecto de Santiago Agustín Gómez", "# Formato: palabra en español = traducción", ""];
            ps.forEach(p => lineas.push(`${p.espanol} = ${p.originaria}`));
            blob = new Blob(["\uFEFF" + lineas.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" });
        } else {
            const q = v => /[;"\r\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
            const lineas = ["español;originaria;categoría;nota"];
            ps.forEach(p => lineas.push([p.espanol, p.originaria, p.categoria, p.nota].map(q).join(";")));
            blob = new Blob(["\uFEFF" + lineas.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
        }
        const slug = norm(c.lengua).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "lengua";
        const nombre = `glosario_${slug}_${new Date().toISOString().slice(0, 10)}.${formato}`;
        const carpeta = await guardarArchivo(blob, nombre);
        return { ruta: `${carpeta}/${nombre}`, nombre, carpeta, cantidad: ps.length };
    }

    // ---------- voces ----------
    async function audioGuardar(id, cuerpo, declarado) {
        const p = await pedir(bd.transaction("palabras").objectStore("palabras").get(id));
        if (!p) throw new Error("No se encontró la palabra.");
        if (!(declarado.startsWith("audio/") || ["application/octet-stream", "video/webm", "video/mp4", "video/ogg"].includes(declarado))) throw new Error("El archivo tiene que ser un audio.");
        if (!cuerpo || !cuerpo.size) throw new Error("El sonido está vacío.");
        if (cuerpo.size > MAX_AUDIO) throw new Error("El sonido pesa demasiado (máximo 4 MB). Usá un clip más corto.");
        const mime = tipoDeAudio(new Uint8Array(await cuerpo.slice(0, 12).arrayBuffer()));
        if (!mime) throw new Error("El archivo no parece un audio válido (mp3, wav, ogg, m4a, aac, flac o webm).");
        p.audio = mime;
        const t = bd.transaction(["palabras", "audios"], "readwrite");
        t.objectStore("palabras").put(p);
        t.objectStore("audios").put({ id, blob: new Blob([cuerpo], { type: mime }), mime });
        await terminar(t);
        return { ok: true, audio: mime };
    }
    async function audioBorrar(id) {
        const p = await pedir(bd.transaction("palabras").objectStore("palabras").get(id));
        if (!p) throw new Error("No se encontró la palabra.");
        p.audio = "";
        const t = bd.transaction(["palabras", "audios"], "readwrite");
        t.objectStore("palabras").put(p); t.objectStore("audios").delete(id);
        await terminar(t);
        return { ok: true };
    }
    async function urlAudio(id) {
        await listo;
        const a = await pedir(bd.transaction("audios").objectStore("audios").get(id));
        if (!a) throw new Error("Esa palabra todavía no tiene voz.");
        return URL.createObjectURL(a.blob);
    }

    // ---------- «servidor» local: responde a las mismas rutas que la versión de escritorio ----------
    async function api(url, o = {}) {
        await listo;
        const u = new URL(url, "http://local");
        const ruta = u.pathname, m = (o.method || "GET").toUpperCase();
        const json = () => { try { return JSON.parse(o.body || "{}"); } catch (_) { return {}; } };
        let r;
        if (ruta === "/api/palabras" && m === "GET") r = await listar();
        else if (ruta === "/api/palabras" && m === "POST") r = await agregar(json());
        else if (ruta === "/api/traducir") r = await traducir(u.searchParams.get("q") || "", u.searchParams.get("inverso") === "1");
        else if (ruta === "/api/config" && m === "PUT") r = await configurar(json());
        else if (ruta === "/api/importar" && m === "POST") r = await importar(o.body);
        else if (ruta === "/api/exportar/guardar" && m === "POST") r = await exportar(json().formato);
        else if (ruta === "/api/redes/abrir" && m === "POST") {
            const a = document.querySelector(`.red-social[data-red="${json().red}"]`);
            if (!a) throw new Error("Esa red no está configurada.");
            window.open(a.href, "_blank", "noopener"); r = { ok: true };
        } else {
            let k;
            if ((k = ruta.match(/^\/api\/palabras\/([0-9a-f]{8})$/))) r = m === "PUT" ? await editar(k[1], json()) : m === "DELETE" ? await borrar(k[1]) : null;
            else if ((k = ruta.match(/^\/api\/audio\/([0-9a-f]{8})$/))) {
                const tipo = (o.headers && (o.headers["Content-Type"] || o.headers["content-type"]) || "").split(";")[0];
                r = m === "PUT" ? await audioGuardar(k[1], o.body, tipo) : m === "DELETE" ? await audioBorrar(k[1]) : null;
            }
        }
        if (r === undefined || r === null) throw new Error("Ocurrió un error inesperado.");
        return r;
    }

    return { api, urlAudio, listo, _prueba: { filasDesdeTexto, filasDesdeJson, norm, tipoDeAudio } };
})();
