// js/facturas.js
// Módulo de Facturación — conecta el frontend con el servidor proxy que llama a Factus

const FacturasModule = {

    // URL del servidor proxy local
    PROXY_URL: 'http://localhost:4000',

    // ── Verificar que el servidor proxy está activo ──────────────────────────
    async verificarServidor() {
        try {
            const res = await fetch(`${this.PROXY_URL}/api/ping`, { signal: AbortSignal.timeout(3000) });
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    // ── Emitir factura a partir de un despacho ───────────────────────────────
    async emitirFactura(despachoId) {
        try {
            const db      = StorageModule.getDB();
            const despacho = db.despachos.find(d => d.id === despachoId);

            if (!despacho) {
                alert('❌ Despacho no encontrado');
                return;
            }

            // Verificar servidor
            const servidorActivo = await this.verificarServidor();
            if (!servidorActivo) {
                alert('⚠️ El servidor de facturación no está activo.\n\nAbre una terminal en la carpeta /server y ejecuta:\nnpm install\nnpm run dev');
                return;
            }

            // Obtener datos del pedido y mesa
            const pedido = db.pedidos.find(p => p.id === despacho.pedidoId);
            const mesa   = db.mesas.find(m => m.numero === despacho.mesaNumero);
            const plato  = pedido ? db.platos.find(p => p.id === pedido.platoId) : null;

            // Construir items de la factura
            const items = [];
            if (plato && pedido) {
                items.push({
                    platoId:  plato.id,
                    nombre:   plato.nombre,
                    cantidad: pedido.cantidad,
                    precio:   plato.precio
                });
            }

            if (items.length === 0) {
                alert('❌ No se encontraron items para facturar');
                return;
            }

            // Mostrar modal de carga
            this._mostrarModalCarga();

            const res = await fetch(`${this.PROXY_URL}/api/facturas`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    despacho: { id: despacho.id, mesaNumero: despacho.mesaNumero },
                    cliente:  'Cliente Mesa ' + despacho.mesaNumero,
                    items
                })
            });

            const data = await res.json();
            this._cerrarModalCarga();

            if (!res.ok) throw new Error(data.error);

            // Guardar referencia en el despacho
            despacho.facturaNumero = data.numero;
            despacho.facturaCUFE   = data.cufe;
            despacho.facturaPDF    = data.pdf_url;
            StorageModule.saveDB(db);

            this._mostrarFactura(data);

        } catch (err) {
            this._cerrarModalCarga();
            console.error('Error facturando:', err);
            alert('❌ Error al emitir factura:\n' + err.message);
        }
    },

    // ── Modal de carga ───────────────────────────────────────────────────────
    _mostrarModalCarga() {
        let modal = document.getElementById('modal-factura-carga');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-factura-carga';
            modal.innerHTML = `
                <div class="factura-carga-box">
                    <div class="factura-spinner"></div>
                    <p>Emitiendo factura electrónica...<br><small>Conectando con Factus DIAN</small></p>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
    },

    _cerrarModalCarga() {
        const modal = document.getElementById('modal-factura-carga');
        if (modal) modal.style.display = 'none';
    },

    // ── Modal con resultado de la factura ────────────────────────────────────
    _mostrarFactura(data) {
        let modal = document.getElementById('modal-factura-resultado');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modal-factura-resultado';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="modal-box factura-resultado-box">
                <div class="modal-header factura-ok-header">
                    <h3>
                        <span class="material-symbols-rounded">receipt_long</span>
                        Factura Electrónica Emitida ✅
                    </h3>
                    <button class="modal-close-btn" onclick="document.getElementById('modal-factura-resultado').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                <div class="factura-body">
                    <div class="factura-row">
                        <span class="factura-label">Número</span>
                        <span class="factura-value">${data.numero || '—'}</span>
                    </div>
                    <div class="factura-row">
                        <span class="factura-label">CUFE</span>
                        <span class="factura-value cufe">${data.cufe ? data.cufe.substring(0, 32) + '...' : '—'}</span>
                    </div>
                    <div class="factura-row">
                        <span class="factura-label">Estado DIAN</span>
                        <span class="badge-status disponible">Validada</span>
                    </div>
                    ${data.pdf_url ? `
                    <div class="factura-row">
                        <span class="factura-label">PDF</span>
                        <a href="${data.pdf_url}" target="_blank" class="btn-modal-save factura-pdf-btn">
                            <span class="material-symbols-rounded">picture_as_pdf</span>
                            Descargar PDF
                        </a>
                    </div>` : ''}
                    ${data.qr ? `
                    <div class="factura-qr">
                        <img src="data:image/png;base64,${data.qr}" alt="QR Factura DIAN" />
                        <small>Código QR — DIAN</small>
                    </div>` : ''}
                </div>
            </div>`;

        document.body.appendChild(modal);
    }
};
