// ==========================================
// Excel (.xlsx) sin librerías: un .xlsx es un ZIP con archivos XML.
// Mismo formato que genera la versión de escritorio (app.py).
// ==========================================
const XLSX = (() => {
    const enc = new TextEncoder();
    const AUTOR = "Santiago Agustín Gómez";

    const tabla = (() => {
        const t = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();
    const crc32 = datos => {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < datos.length; i++) c = tabla[(c ^ datos[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    };

    // ZIP "almacenado" (sin comprimir): simple y válido para Excel
    function zip(archivos) {
        const locales = [], centrales = [];
        let desplazamiento = 0;
        for (const [nombre, datos] of archivos) {
            const nb = enc.encode(nombre), crc = crc32(datos);
            const lh = new DataView(new ArrayBuffer(30 + nb.length));
            lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
            lh.setUint16(10, 0, true); lh.setUint16(12, 23585, true); lh.setUint32(14, crc, true);
            lh.setUint32(18, datos.length, true); lh.setUint32(22, datos.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
            new Uint8Array(lh.buffer).set(nb, 30);
            const ch = new DataView(new ArrayBuffer(46 + nb.length));
            ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
            ch.setUint16(12, 0, true); ch.setUint16(14, 23585, true); ch.setUint32(16, crc, true);
            ch.setUint32(20, datos.length, true); ch.setUint32(24, datos.length, true); ch.setUint16(28, nb.length, true);
            ch.setUint32(42, desplazamiento, true);
            new Uint8Array(ch.buffer).set(nb, 46);
            locales.push(new Uint8Array(lh.buffer), datos);
            centrales.push(new Uint8Array(ch.buffer));
            desplazamiento += lh.byteLength + datos.length;
        }
        const tamCentral = centrales.reduce((s, c) => s + c.length, 0);
        const fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
        fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
        const partes = [...locales, ...centrales, new Uint8Array(fin.buffer)];
        const salida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
        let pos = 0;
        for (const p of partes) { salida.set(p, pos); pos += p.length; }
        return salida;
    }

    const esc = t => String(t == null ? "" : t).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const letra = n => { let s = ""; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

    function generar(lengua, palabras) {
        const filas = [["Español", lengua, "Categoría", "Nota"]];
        palabras.forEach(p => filas.push([p.espanol, p.originaria, p.categoria, p.nota]));
        const celdas = filas.map((fila, i) => {
            const cs = fila.map((v, j) => `<c r="${letra(j + 1)}${i + 1}" t="inlineStr"${i === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
            return `<row r="${i + 1}">${cs.join("")}</row>`;
        });
        const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
        const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
        const hoja = `${cab}<worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
            + '<cols><col min="1" max="2" width="32" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="45" customWidth="1"/></cols>'
            + `<sheetData>${celdas.join("")}</sheetData><autoFilter ref="A1:D${filas.length}"/></worksheet>`;
        const estilos = `${cab}<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>`
            + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3D2B"/><bgColor indexed="64"/></patternFill></fill></fills>'
            + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
            + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        const libro = `${cab}<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Glosario" sheetId="1" r:id="rId1"/></sheets></workbook>`;
        const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        const relsLibro = `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`;
        const relsRaiz = `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
        const propiedades = `${cab}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Glosario - ${esc(lengua)}</dc:title><dc:creator>${esc(AUTOR)}</dc:creator></cp:coreProperties>`;
        const tipos = `${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
            + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
        return zip([
            ["[Content_Types].xml", enc.encode(tipos)], ["_rels/.rels", enc.encode(relsRaiz)], ["docProps/core.xml", enc.encode(propiedades)],
            ["xl/workbook.xml", enc.encode(libro)], ["xl/_rels/workbook.xml.rels", enc.encode(relsLibro)], ["xl/styles.xml", enc.encode(estilos)],
            ["xl/worksheets/sheet1.xml", enc.encode(hoja)],
        ]);
    }
    return { generar };
})();
