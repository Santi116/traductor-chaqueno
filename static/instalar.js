// ==========================================
// Instalación como app + funcionamiento sin conexión
// ==========================================
(() => {
    const enNativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!enNativo && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    let evento = null;
    const yaInstalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    function tarjeta(titulo, texto, boton) {
        if (enNativo || yaInstalada || document.getElementById("tarjetaInstalar")) return;
        const caja = document.createElement("div");
        caja.className = "tarjeta"; caja.id = "tarjetaInstalar";
        const h = document.createElement("h2"); h.textContent = titulo;
        const p = document.createElement("p"); p.className = "ayuda"; p.textContent = texto;
        caja.append(h, p);
        if (boton) caja.append(boton);
        const panel = document.getElementById("tab-datos");
        panel.insertBefore(caja, panel.firstChild);
    }
    window.addEventListener("beforeinstallprompt", e => {
        e.preventDefault(); evento = e;
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn"; b.textContent = "📲 Instalar la aplicación";
        b.addEventListener("click", async () => { evento.prompt(); await evento.userChoice; evento = null; const c = document.getElementById("tarjetaInstalar"); if (c) c.remove(); });
        tarjeta("Instalar en este dispositivo", "Se agrega a la pantalla de inicio, se abre como una app y funciona sin internet.", b);
    });
    window.addEventListener("appinstalled", () => { const c = document.getElementById("tarjetaInstalar"); if (c) c.remove(); });
    if (esIOS && !yaInstalada) {
        tarjeta("Instalar en el iPhone", "Tocá el botón Compartir de Safari y elegí «Agregar a inicio». Así se abre como una app y funciona sin internet.");
    }
})();
