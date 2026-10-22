// ==========================================
// Bandera Wiphala flameando (canvas) + pantalla de inicio
// ==========================================
const Bandera = (() => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const imagen = new Image();
    const lienzos = [];
    let listo = false, bucleActivo = false;

    function medir(l) {
        const dpr = window.devicePixelRatio || 1;
        l.w = l.canvas.clientWidth;
        l.h = l.canvas.clientHeight;
        l.canvas.width = Math.max(1, l.w * dpr);
        l.canvas.height = Math.max(1, l.h * dpr);
        l.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function dibujar(l, t) {
        const { ctx, w, h, opts } = l;
        if (!w || !h) return;
        ctx.clearRect(0, 0, w, h);

        const asta = opts.asta ? Math.max(3, w * 0.035) : 0;
        const A = h * opts.amplitud;
        const margen = A * 1.25;
        const fx = asta, fw = w - asta - 1, fy = margen, fh = h - margen * 2;

        if (opts.asta) {
            const g = ctx.createLinearGradient(0, 0, asta, 0);
            g.addColorStop(0, "#f2f2f2"); g.addColorStop(1, "#7d7d7d");
            ctx.fillStyle = g;
            ctx.fillRect(0, asta * 0.9, asta, h - asta * 0.9);
            ctx.fillStyle = "#e3a857";
            ctx.beginPath(); ctx.arc(asta / 2, asta * 0.9, asta * 0.9, 0, 6.2832); ctx.fill();
        }

        const paso = 2;
        for (let x = 0; x < fw; x += paso) {
            const p = x / fw;                              // 0 en el asta, 1 en la punta
            const fase = p * Math.PI * 3 - t * 2.4;
            const dy = Math.sin(fase) * A * (0.12 + 0.88 * p);
            const sx = p * imagen.naturalWidth;
            const sw = Math.min((paso / fw) * imagen.naturalWidth + 1, imagen.naturalWidth - sx);
            ctx.drawImage(imagen, sx, 0, sw, imagen.naturalHeight, fx + x, fy + dy, paso + 0.6, fh);
            const brillo = Math.cos(fase) * 0.17 * (0.2 + 0.8 * p);   // luz y sombra de los pliegues
            ctx.fillStyle = brillo > 0 ? `rgba(0,0,0,${brillo})` : `rgba(255,255,255,${-brillo * 0.8})`;
            ctx.fillRect(fx + x, fy + dy, paso + 0.6, fh);
        }
    }

    function bucle(ms) {
        let animados = 0;
        for (let i = lienzos.length - 1; i >= 0; i--) {
            const l = lienzos[i];
            if (!l.canvas.isConnected) { lienzos.splice(i, 1); continue; }
            if (l.animar) { animados++; dibujar(l, ms / 1000); }
        }
        if (animados) requestAnimationFrame(bucle); else bucleActivo = false;
    }

    function arrancar() {
        if (!bucleActivo && lienzos.some(l => l.animar)) { bucleActivo = true; requestAnimationFrame(bucle); }
    }

    function ondear(canvas, opts = {}) {
        if (!canvas) return;
        const l = {
            canvas, ctx: canvas.getContext("2d"), w: 0, h: 0,
            opts: { asta: true, amplitud: 0.055, ...opts },
            animar: opts.animar !== false && !reducido,
        };
        lienzos.push(l);
        new ResizeObserver(() => { if (listo) { medir(l); dibujar(l, 0.8); } }).observe(canvas);
        if (listo) { medir(l); dibujar(l, 0.8); arrancar(); }
    }

    imagen.addEventListener("load", () => {
        listo = true;
        lienzos.forEach(l => { medir(l); dibujar(l, 0.8); });
        arrancar();
    });
    imagen.src = "static/img/wiphala.jpg";

    return { ondear };
})();

// ---------- pantalla de inicio ----------
const splashListo = new Promise(resolver => {
    const sp = document.getElementById("splash");
    if (!sp) return resolver();
    let cerrado = false;
    const cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        sp.classList.add("oculto");
        setTimeout(() => { sp.remove(); resolver(); }, 650);
    };
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(cerrar, reducido ? 900 : 2800);
    sp.addEventListener("click", cerrar);
    document.addEventListener("keydown", cerrar, { once: true });
});

Bandera.ondear(document.getElementById("splashBandera"), { amplitud: 0.055 });
Bandera.ondear(document.getElementById("banderaCab"), { amplitud: 0.06 });
Bandera.ondear(document.getElementById("banderaPie"), { asta: false, amplitud: 0.05, animar: false });
