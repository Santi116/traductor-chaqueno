// ==========================================
// VOZ: grabar la pronunciación de una palabra y reproducirla
// ==========================================
const Voz = (() => {
    const $ = s => document.querySelector(s);
    const MAX_SEG = 15;           // una palabra no necesita más
    let sonando = null;           // { audio, boton }

    // ---------- reproducir ----------
    function reproducir(p, boton, alError) {
        if (sonando) {
            sonando.audio.pause();
            if (sonando.boton) sonando.boton.classList.remove("sonando");
            const eraElMismo = sonando.boton === boton && boton;
            sonando = null;
            if (eraElMismo) return;
        }
        const audio = new Audio();
        sonando = { audio, boton };
        if (boton) boton.classList.add("sonando");
        const fin = () => {
            if (boton) boton.classList.remove("sonando");
            if (sonando && sonando.audio === audio) sonando = null;
        };
        audio.addEventListener("ended", fin);
        audio.addEventListener("error", () => { fin(); if (alError) alError("No se pudo reproducir la voz."); });
        Almacen.urlAudio(p.id)
            .then(u => { audio.src = u; audio.addEventListener("ended", () => URL.revokeObjectURL(u)); return audio.play(); })
            .catch(() => { fin(); if (alError) alError("No se pudo reproducir la voz."); });
    }

    const formato = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    // ---------- grabar ----------
    // opciones: titulo, existente (ya tiene voz), alGuardar(blob, mime), alEliminar()
    function grabar({ titulo, existente = false, abrirArchivo = false, alGuardar, alEliminar }) {
        const dlg = $("#dlgVoz");
        const rec = $("#vozRec"), tiempo = $("#vozTiempo"), estadoP = $("#vozEstado");
        const previa = $("#vozPrevia"), guardar = $("#vozGuardar"), eliminar = $("#vozEliminar");
        const barras = [...document.querySelectorAll("#vozMedidor span")];
        const entrada = $("#vozArchivo"), externo = $("#vozExterno");
        let flujo = null, grabador = null, trozos = [], blob = null, mime = "", url = null;
        let temporizador = null, ctx = null, raf = 0;

        const msg = (texto, mal = false) => { estadoP.textContent = texto; estadoP.classList.toggle("mal", mal); };

        function soltarMicrofono() {
            clearInterval(temporizador);
            cancelAnimationFrame(raf);
            if (flujo) flujo.getTracks().forEach(t => t.stop());
            flujo = null;
            if (ctx) { ctx.close().catch(() => {}); ctx = null; }
            barras.forEach(b => { b.style.height = "6px"; });
        }
        function reiniciar() {
            blob = null;
            if (url) URL.revokeObjectURL(url);
            url = null;
            previa.hidden = true;
            previa.removeAttribute("src");
            guardar.disabled = true;
            tiempo.textContent = "0:00";
            entrada.value = "";
            rec.classList.remove("grabando");
            rec.textContent = "🎙️";
        }
        // ---------- sonido externo (archivo elegido o arrastrado desde el sistema) ----------
        const EXT = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", webm: "audio/webm", weba: "audio/webm" };
        const MAX_BYTES = 4 * 1024 * 1024;
        const tam = n => n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
        function usarArchivo(archivo) {
            if (!archivo) return;
            const ext = (archivo.name.split(".").pop() || "").toLowerCase();
            if (!((archivo.type || "").startsWith("audio/") || EXT[ext])) {
                return msg("Ese archivo no parece un audio. Usá mp3, wav, ogg, m4a, aac, flac o webm.", true);
            }
            if (archivo.size > MAX_BYTES) return msg(`El sonido pesa ${tam(archivo.size)} y el máximo es 4 MB. Usá un clip más corto.`, true);
            if (archivo.size < 200) return msg("El archivo está vacío.", true);
            if (grabador && grabador.state === "recording") { grabador.onstop = null; grabador.stop(); }
            soltarMicrofono();
            reiniciar();
            mime = (archivo.type || "").startsWith("audio/") ? archivo.type : EXT[ext];   // el servidor confirma el tipo real
            blob = archivo;
            url = URL.createObjectURL(blob);
            previa.src = url;
            previa.hidden = false;
            guardar.disabled = false;
            msg(`📁 ${archivo.name} (${tam(archivo.size)}). Escuchalo y, si es la voz correcta, tocá «Guardar voz».`);
        }

        function cerrar() {
            if (grabador) grabador.onstop = null;
            if (grabador && grabador.state === "recording") grabador.stop();
            soltarMicrofono();
            reiniciar();
            if (dlg.open) dlg.close();
        }
        function detener() { if (grabador && grabador.state === "recording") grabador.stop(); }

        async function empezar() {
            reiniciar();
            msg("");
            if (!navigator.mediaDevices || !window.MediaRecorder) {
                return msg("Este equipo no permite grabar audio desde la aplicación.", true);
            }
            try {
                flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            } catch (e) {
                return msg(e.name === "NotFoundError"
                    ? "No se encontró ningún micrófono conectado."
                    : "No se pudo usar el micrófono. Permití el acceso al micrófono y volvé a intentar.", true);
            }
            const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t)) || "";
            grabador = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
            trozos = [];
            grabador.ondataavailable = e => { if (e.data && e.data.size) trozos.push(e.data); };
            grabador.onstop = () => {
                soltarMicrofono();
                mime = (grabador.mimeType || tipo || "audio/webm").split(";")[0];
                blob = new Blob(trozos, { type: mime });
                rec.classList.remove("grabando");
                rec.textContent = "🎙️";
                if (blob.size < 1500) {
                    blob = null;
                    return msg("No se escuchó nada. Probá de nuevo, más cerca del micrófono.", true);
                }
                url = URL.createObjectURL(blob);
                previa.src = url;
                previa.hidden = false;
                guardar.disabled = false;
                msg("Escuchá cómo quedó. Si te gusta, tocá «Guardar voz».");
            };
            try {   // medidor de volumen (si falla, se graba igual)
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                const analizador = ctx.createAnalyser();
                analizador.fftSize = 64;
                ctx.createMediaStreamSource(flujo).connect(analizador);
                const datos = new Uint8Array(analizador.frequencyBinCount);
                const pintar = () => {
                    analizador.getByteFrequencyData(datos);
                    barras.forEach((b, i) => { b.style.height = (6 + datos[i + 1] / 255 * 44) + "px"; });
                    raf = requestAnimationFrame(pintar);
                };
                pintar();
            } catch (_) {}
            grabador.start();
            const t0 = Date.now();
            rec.classList.add("grabando");
            rec.textContent = "⏹️";
            msg("Grabando… tocá otra vez para terminar.");
            temporizador = setInterval(() => {
                const s = (Date.now() - t0) / 1000;
                tiempo.textContent = formato(s);
                if (s >= MAX_SEG) detener();
            }, 100);
        }

        $("#vozTitulo").textContent = titulo;
        eliminar.hidden = !existente;
        rec.onclick = () => (grabador && grabador.state === "recording" ? detener() : empezar());
        $("#vozCancelar").onclick = cerrar;
        dlg.onclose = () => { if (grabador) grabador.onstop = null; soltarMicrofono(); reiniciar(); };
        guardar.onclick = async () => {
            guardar.disabled = true;
            msg("Guardando…");
            try { await alGuardar(blob, mime); cerrar(); }
            catch (e) { msg(e.message, true); guardar.disabled = false; }
        };
        eliminar.onclick = async () => {
            if (!confirm("¿Eliminar la voz guardada?")) return;
            try { await alEliminar(); cerrar(); } catch (e) { msg(e.message, true); }
        };
        externo.onclick = () => { entrada.value = ""; entrada.click(); };
        entrada.onchange = () => usarArchivo(entrada.files && entrada.files[0]);
        dlg.ondragover = e => { e.preventDefault(); dlg.classList.add("arrastrando"); };
        dlg.ondragleave = () => dlg.classList.remove("arrastrando");
        dlg.ondrop = e => { e.preventDefault(); dlg.classList.remove("arrastrando"); usarArchivo(e.dataTransfer && e.dataTransfer.files[0]); };
        reiniciar();
        msg(existente ? "Esta palabra ya tiene voz. Grabá de nuevo para reemplazarla." : "Tocá el micrófono y pronunciá la palabra (máximo 15 segundos).");
        dlg.showModal();
        if (abrirArchivo) entrada.click();   // abre el selector de archivos del sistema operativo
    }

    return { reproducir, grabar };
})();
