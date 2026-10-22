// ==========================================
// MINGA · guía virtual animada
// ==========================================
const Minga = (() => {
    const $ = s => document.querySelector(s);
    const svg = $("#minga");
    const cuerpo = $("#burbujaTexto");
    const botones = $("#burbujaAcciones");
    const sr = $("#mingaSr");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cfg = { palabras: () => [], lengua: () => "la lengua originaria" };
    let tipeo = null, reposo = null, ocio = null, hablando = false, ultimoMouse = 0, indiceConsejo = 0;

    // ---------- estado del personaje ----------
    function estado(nombre) {
        svg.removeAttribute("data-estado");
        void svg.getBoundingClientRect(); // reinicia las animaciones
        svg.setAttribute("data-estado", nombre);
    }

    function parar() {
        clearInterval(tipeo);
        clearTimeout(reposo);
        svg.classList.remove("habla");
        hablando = false;
    }

    function nombreLengua() {
        const l = cfg.lengua() || "la lengua originaria";
        return l.startsWith("Lengua") ? l.charAt(0).toLowerCase() + l.slice(1) : l;
    }

    // ---------- hablar (efecto máquina de escribir) ----------
    // partes: array de textos; {b: "texto"} se muestra destacado.
    function decir(partes, { estado: emocion = "neutral", acciones = [], mantener = 5000 } = {}) {
        parar();
        estado(emocion);
        cuerpo.replaceChildren();
        botones.replaceChildren();

        const trozos = partes.map(p => typeof p === "string"
            ? { nodo: document.createTextNode(""), texto: p }
            : { nodo: document.createElement("strong"), texto: p.b });
        trozos.forEach(t => cuerpo.append(t.nodo));
        const total = trozos.reduce((n, t) => n + t.texto.length, 0);
        sr.textContent = trozos.map(t => t.texto).join("");

        const cursor = document.createElement("span");
        cursor.className = "cursor";
        cuerpo.append(cursor);

        let escritos = 0;
        const pintar = () => {
            let resto = escritos;
            for (const t of trozos) {
                const n = Math.max(0, Math.min(t.texto.length, resto));
                const txt = t.texto.slice(0, n);
                if (t.nodo.nodeType === 3) t.nodo.data = txt; else t.nodo.textContent = txt;
                resto -= n;
            }
        };
        const fin = () => {
            clearInterval(tipeo);
            cursor.remove();
            svg.classList.remove("habla");
            hablando = false;
            acciones.forEach(a => {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = a.texto;
                b.addEventListener("click", a.fn);
                botones.append(b);
            });
            if (emocion !== "neutral" && mantener) reposo = setTimeout(() => estado("neutral"), mantener);
            reiniciarOcio();
        };

        if (reducido || total === 0) { escritos = total; pintar(); fin(); return; }
        svg.classList.add("habla");
        hablando = true;
        tipeo = setInterval(() => { escritos += 2; pintar(); if (escritos >= total) fin(); }, 22);
    }

    function pensar() {
        parar();
        estado("pensando");
        const puntos = document.createElement("span");
        puntos.className = "puntos";
        puntos.innerHTML = "<span></span><span></span><span></span>";
        cuerpo.replaceChildren(document.createTextNode("Buscando en mi memoria"), puntos);
        botones.replaceChildren();
        sr.textContent = "";
    }

    // ---------- frases prearmadas ----------
    function saludar() {
        const h = new Date().getHours();
        const hola = h < 12 ? "¡Buen día!" : h < 20 ? "¡Buenas tardes!" : "¡Buenas noches!";
        const n = cfg.palabras().length;
        if (n === 0) {
            decir([`${hola} Soy Minga, tu guía del monte. Todavía no sé ninguna palabra de ${nombreLengua()}: enseñame desde «Agregar» o cargá tu glosario en «Datos».`],
                { estado: "saludo", mantener: 7000 });
        } else {
            decir([`${hola} Soy Minga, tu guía del monte. Conozco ${n} palabra${n === 1 ? "" : "s"} de ${nombreLengua()}. Escribime una palabra o preguntame «¿cómo se dice árbol?».`],
                { estado: "saludo", mantener: 7000 });
        }
    }

    function palabraDelDia() {
        const ps = cfg.palabras();
        if (!ps.length) {
            return decir(["Todavía no tengo palabras para mostrarte. ¡Enseñame algunas!"], { estado: "duda" });
        }
        const p = ps[Math.floor(Math.random() * ps.length)];
        decir(["¿Sabías que «", p.espanol, "» se dice ", { b: p.originaria }, "?"],
            { estado: "feliz", mantener: 6000, acciones: [{ texto: "🎲 Otra palabra", fn: palabraDelDia }] });
    }

    function ayuda() {
        decir(["Traduzco palabras y también frases cortas, palabra por palabra. Probá con «¿cómo se dice gato?» o «el gato come maíz». Con el botón ⇄ voy al revés. Si no sé algo, me lo enseñás y no se me olvida."],
            { estado: "saludo", mantener: 7000 });
    }

    const consejos = [
        "💡 Tocame cuando quieras: te cuento una palabra al azar.",
        "💡 Con el botón ⇄ podés traducir al revés, de la lengua originaria al español.",
        "💡 Escribí una frase corta y la traduzco palabra por palabra.",
        "💡 En «Datos» podés cargar todo tu glosario de una vez desde un archivo.",
        "💡 Una misma palabra puede tener varias traducciones: guardalas todas.",
    ];

    function consejo() {
        if (hablando || document.hidden) return reiniciarOcio();
        if (cfg.palabras().length && Math.random() < 0.4) return palabraDelDia();
        decir([consejos[indiceConsejo++ % consejos.length]], { estado: "neutral" });
    }

    function reiniciarOcio() {
        clearTimeout(ocio);
        ocio = setTimeout(consejo, 40000);
    }

    // ---------- mirada: los ojos siguen el cursor ----------
    function mirar(x, y) {
        svg.style.setProperty("--px", x.toFixed(1) + "px");
        svg.style.setProperty("--py", y.toFixed(1) + "px");
    }
    let pendiente = false;
    document.addEventListener("pointermove", e => {
        ultimoMouse = Date.now();
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
            pendiente = false;
            const r = svg.getBoundingClientRect();
            const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
            const dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
            mirar(Math.max(-1, Math.min(1, dx)) * 3.2, Math.max(-1, Math.min(1, dy)) * 2.4);
        });
    });
    setInterval(() => {
        if (!reducido && Date.now() - ultimoMouse > 4000) mirar((Math.random() - .5) * 5, (Math.random() - .5) * 3);
    }, 3500);

    // ---------- fondo: red neuronal ----------
    function red() {
        const c = $("#red");
        if (!c) return;
        const ctx = c.getContext("2d");
        let w = 0, h = 0, nodos = [];
        const ajustar = () => {
            const r = c.parentElement.getBoundingClientRect();
            const d = window.devicePixelRatio || 1;
            w = r.width; h = r.height;
            c.width = w * d; c.height = h * d;
            ctx.setTransform(d, 0, 0, d, 0, 0);
            nodos = Array.from({ length: Math.round(w * h / 9000) }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, r: Math.random() * 1.4 + .8,
            }));
        };
        const cuadro = () => {
            ctx.clearRect(0, 0, w, h);
            for (const a of nodos) {
                a.x += a.vx; a.y += a.vy;
                if (a.x < 0 || a.x > w) a.vx *= -1;
                if (a.y < 0 || a.y > h) a.vy *= -1;
            }
            for (let i = 0; i < nodos.length; i++) {
                for (let j = i + 1; j < nodos.length; j++) {
                    const d = Math.hypot(nodos[i].x - nodos[j].x, nodos[i].y - nodos[j].y);
                    if (d < 110) {
                        ctx.strokeStyle = `rgba(227,168,87,${(1 - d / 110) * .35})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(nodos[i].x, nodos[i].y); ctx.lineTo(nodos[j].x, nodos[j].y); ctx.stroke();
                    }
                }
            }
            ctx.fillStyle = "rgba(255,226,170,.75)";
            for (const a of nodos) { ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill(); }
            if (!reducido) requestAnimationFrame(cuadro);
        };
        new ResizeObserver(() => { ajustar(); if (reducido) cuadro(); }).observe(c.parentElement);
        ajustar();
        cuadro();
    }

    // ---------- arranque ----------
    $("#avatar").addEventListener("click", palabraDelDia);
    $("#sugDia").addEventListener("click", palabraDelDia);
    $("#sugAyuda").addEventListener("click", ayuda);
    document.addEventListener("keydown", reiniciarOcio);
    document.addEventListener("pointerdown", reiniciarOcio);
    red();
    reiniciarOcio();

    return {
        config: c => { cfg = { ...cfg, ...c }; },
        decir, pensar, saludar, palabraDelDia, ayuda, estado,
    };
})();
