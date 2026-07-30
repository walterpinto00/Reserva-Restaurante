// js/modules.js
const UIModule = {
    updateDateDisplay() {
        try {
            const dateSpan = document.getElementById('current-date');
            if (dateSpan) {
                dateSpan.textContent = new Date().toLocaleDateString('es-CO', {
                    day: '2-digit', month: 'long', year: 'numeric'
                });
            }
        } catch (err) {
            console.error('Error al actualizar fecha:', err);
        }
    },

    renderDashboardStats() {
        try {
            const container = document.getElementById('stats-container');
            if (!container) return;
            const db = StorageModule.getDB();
            const mesasOcupadas = db.mesas.filter(m => m.estado === 'ocupada').length;

            container.innerHTML = `
                <div class="stat-card glass-panel blue stagger-item" style="animation-delay: 0s">
                    <div class="stat-icon"><span class="material-symbols-rounded">edit_calendar</span></div>
                    <div class="stat-value">${db.reservas.length}</div>
                    <div class="stat-label">Reservas Activas</div>
                </div>
                <div class="stat-card glass-panel purple stagger-item" style="animation-delay: 0.1s">
                    <div class="stat-icon"><span class="material-symbols-rounded">skillet</span></div>
                    <div class="stat-value">${db.pedidos.length}</div>
                    <div class="stat-label">Platos en Cola</div>
                </div>
                <div class="stat-card glass-panel cyan stagger-item" style="animation-delay: 0.2s">
                    <div class="stat-icon"><span class="material-symbols-rounded">moped</span></div>
                    <div class="stat-value">${db.despachos.length}</div>
                    <div class="stat-label">Despachos</div>
                </div>
                <div class="stat-card glass-panel green stagger-item" style="animation-delay: 0.3s">
                    <div class="stat-icon"><span class="material-symbols-rounded">table_bar</span></div>
                    <div class="stat-value">${mesasOcupadas}</div>
                    <div class="stat-label">Mesas Ocupadas</div>
                </div>
            `;
        } catch (err) {
            console.error('Error al renderizar estadísticas:', err);
        }
    },


    renderMesas() {
        try {
            const container = document.getElementById('mesas-container');
            if (!container) return;
            const db = StorageModule.getDB();
            container.innerHTML = '';

            db.mesas.forEach((mesa, index) => {
                const estadoClass = mesa.estado === 'disponible' ? 'disponible'
                    : mesa.estado === 'ocupada' ? 'ocupada' : 'reservada';

                container.innerHTML += `
                    <div class="mesa-card glass-panel stagger-item" style="animation-delay: ${index * 0.05}s">
                        <div class="mesa-icon">
                            <span class="material-symbols-rounded">table_restaurant</span>
                        </div>
                        <h3>Mesa ${mesa.numero}</h3>
                        <p class="mesa-zona">${mesa.zona}</p>
                        <p class="mesa-cap">${mesa.capacidad} comensales</p>
                        <span class="badge-status ${estadoClass}">
                            ${mesa.estado.charAt(0).toUpperCase() + mesa.estado.slice(1)}
                        </span>
                    </div>
                `;
            });
        } catch (err) {
            console.error('Error al renderizar mesas:', err);
        }
    },


    // =====================================================
    //  RESERVAS — Flujo completo con datos reales
    // =====================================================
    renderReservas() {
        try {
            const section = document.getElementById('panel-reservas');
            if (!section) return;
            const db = StorageModule.getDB();

            // ---- Filas de la tabla ----
            let filas = '';
            if (db.reservas.length === 0) {
                filas = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state">
                                <span class="material-symbols-rounded">edit_calendar</span>
                                <p>No hay reservas registradas. Crea la primera usando el botón de arriba.</p>
                            </div>
                        </td>
                    </tr>`;
            } else {
                db.reservas.forEach((r, index) => {
                    const estadoClass = r.estado || 'pendiente';
                    const mesaObj = db.mesas.find(m => m.id === r.mesaId);
                    const mesaLabel = mesaObj
                        ? `Mesa ${mesaObj.numero} (${mesaObj.zona})`
                        : r.mesaId;

                    filas += `
                        <tr class="stagger-item" style="animation-delay: ${index * 0.05}s">
                            <td>${r.cliente}</td>
                            <td>${mesaLabel}</td>
                            <td>${r.fecha}</td>
                            <td>${r.hora}</td>
                            <td>${r.comensales} pax</td>
                            <td>
                                <span class="badge-reserva ${estadoClass}">
                                    ${estadoClass.toUpperCase()}
                                </span>
                            </td>
                        </tr>`;
                });
            }

            section.innerHTML = `
                <div class="panel-toolbar">
                    <h2 class="section-title">
                        <div class="section-title-icon">
                            <span class="material-symbols-rounded">edit_calendar</span>
                        </div>
                        Control de Reservas
                    </h2>
                    <button id="btn-nueva-reserva" class="btn-new-reserva">
                        <span class="material-symbols-rounded">add_circle</span>
                        Nueva Reserva
                    </button>
                </div>
                <div class="table-container">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>CLIENTE</th>
                                    <th>MESA</th>
                                    <th>FECHA</th>
                                    <th>HORA</th>
                                    <th>COMENSALES</th>
                                    <th>ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filas}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // Vincular botón que se acaba de inyectar
            const btnNueva = document.getElementById('btn-nueva-reserva');
            if (btnNueva) {
                btnNueva.addEventListener('click', () => {
                    // Disparar evento global que app.js escucha
                    document.dispatchEvent(new CustomEvent('abrirModalReserva'));
                });
            }
        } catch (err) {
            console.error('Error al renderizar reservas:', err);
        }
    },

    // Cumple requerimiento de Cocina: Cola de platos
    renderPedidos() {
        try {
            const section = document.getElementById('panel-pedidos');
            if (!section) return;
            const db = StorageModule.getDB();
            const session = AuthModule.getSession();
            
            // Filtrar pedidos que no hayan sido despachados
            const pedidosActivos = db.pedidos.filter(p => p.estado !== 'despachado');
            let filas = '';

            if (pedidosActivos.length === 0) {
                filas = `<tr><td colspan="5"><div class="empty-state"><span class="material-symbols-rounded">skillet</span><p>La cola de cocina está vacía.</p></div></td></tr>`;
            } else {
                pedidosActivos.forEach((p, index) => {
                    const mesaObj = db.mesas.find(m => m.id === p.mesaId);
                    const platoObj = db.platos.find(pl => pl.id === p.platoId);
                    
                    let badge = p.estado === 'pendiente' ? 'pendiente' : p.estado === 'en_preparacion' ? 'preparando' : 'confirmada';
                    let textoEstado = p.estado.replace('_', ' ').toUpperCase();
                    
                    let acciones = '';
                    // Permisos de Cocina
                    if (session.rol === 'admin' || session.rol === 'cocina') {
                        if (p.estado === 'pendiente') {
                            acciones += `<button class="btn-action" onclick="window.cambiarEstadoPedido('${p.id}', 'en_preparacion')">Empezar a Preparar</button>`;
                        } else if (p.estado === 'en_preparacion') {
                            acciones += `<button class="btn-action" onclick="window.cambiarEstadoPedido('${p.id}', 'listo')">Marcar Listo</button>`;
                        }
                    }
                    // Permiso de Mesero/Despacho para enviar platos "Listos"
                    if ((session.rol === 'admin' || session.rol === 'mesero' || session.rol === 'despacho') && p.estado === 'listo') {
                        acciones += `<button class="btn-action" onclick="window.crearDespacho('${p.id}')">Enviar a Despacho</button>`;
                    }

                    filas += `
                        <tr class="stagger-item" style="animation-delay: ${index * 0.05}s">
                            <td style="color:var(--text-muted)">#${p.id.slice(-4)}</td>
                            <td>Mesa ${mesaObj ? mesaObj.numero : '?'}</td>
                            <td><strong>${p.cantidad}x</strong> ${platoObj ? platoObj.nombre : '?'}</td>
                            <td><span class="badge-reserva ${badge}">${textoEstado}</span></td>
                            <td>${acciones}</td>
                        </tr>`;
                });
            }

            const btnNuevo = (session.rol === 'admin' || session.rol === 'mesero') ? 
                `<button id="btn-nuevo-pedido" class="btn-new-reserva"><span class="material-symbols-rounded">add_circle</span> Nuevo Pedido</button>` : '';

            section.innerHTML = `
                <div class="panel-toolbar">
                    <h2 class="section-title">
                        <div class="section-title-icon">
                            <span class="material-symbols-rounded">skillet</span>
                        </div>
                        Cola de Preparación
                    </h2>
                    ${btnNuevo}
                </div>
                <div class="table-container"><div class="table-scroll"><table>
                    <thead><tr><th>ORDEN</th><th>MESA</th><th>PEDIDO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                    <tbody>${filas}</tbody>
                </table></div></div>`;

            if (document.getElementById('btn-nuevo-pedido')) {
                document.getElementById('btn-nuevo-pedido').addEventListener('click', () => {
                    document.dispatchEvent(new CustomEvent('abrirModalPedido'));
                });
            }
        } catch (err) { console.error('Error al renderizar pedidos:', err); }
    },

    renderDespachos() {
        try {
            const section = document.getElementById('panel-despachos');
            if (!section) return;
            const db = StorageModule.getDB();
            const session = AuthModule.getSession();
            let filas = '';
            
            if (db.despachos.length === 0) {
                filas = `<tr><td colspan="5"><div class="empty-state"><span class="material-symbols-rounded">moped</span><p>No hay despachos registrados.</p></div></td></tr>`;
            } else {
                db.despachos.forEach((d, index) => {
                    let badge = d.estado === 'en_ruta' ? 'pendiente' : 'confirmada';
                    let textoEstado = d.estado.replace('_', ' ').toUpperCase();
                    let acciones = '';

                    if ((session.rol === 'admin' || session.rol === 'despacho') && d.estado === 'en_ruta') {
                        acciones = `<button class="btn-action" onclick="window.entregarDespacho('${d.id}')">Marcar Entregado</button>`;
                    }

                    // Botón Facturar — visible para admin/mesero si el despacho fue entregado
                    if (d.estado === 'entregado' && (session.rol === 'admin' || session.rol === 'mesero')) {
                        if (d.facturaNumero) {
                            acciones += `<span class="badge-status disponible" title="Factura ${d.facturaNumero}">
                                <span class="material-symbols-rounded" style="font-size:14px">receipt_long</span>
                                Factura ${d.facturaNumero}
                            </span>`;
                        } else {
                            acciones += `<button class="btn-facturar" onclick="FacturasModule.emitirFactura('${d.id}')">
                                <span class="material-symbols-rounded">receipt_long</span> Facturar
                            </button>`;
                        }
                    }

                    filas += `
                        <tr class="stagger-item" style="animation-delay: ${index * 0.05}s">
                            <td style="color:var(--text-muted)">#${d.id.slice(-4)}</td>
                            <td>Ref Pedido #${d.pedidoId.slice(-4)}</td>
                            <td>Mesa ${d.mesaNumero}</td>
                            <td><span class="badge-reserva ${badge}">${textoEstado}</span></td>
                            <td>${acciones}</td>
                        </tr>`;
                });
            }

            section.innerHTML = `
                <div class="panel-toolbar">
                    <h2 class="section-title">
                        <div class="section-title-icon">
                            <span class="material-symbols-rounded">moped</span>
                        </div>
                        Logística de Despachos
                    </h2>
                </div>
                <div class="table-container"><div class="table-scroll"><table>
                    <thead><tr><th>DESPACHO</th><th>ORIGEN</th><th>DESTINO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                    <tbody>${filas}</tbody>
                </table></div></div>`;
        } catch (err) { console.error('Error al renderizar despachos:', err); }
    },
    

    renderUsuarios() {
        try {
            const section = document.getElementById('panel-usuarios');
            if (!section) return;
            const db = StorageModule.getDB();

            let filas = '';
            db.usuarios.forEach(u => {
                filas += `
                    <tr>
                        <td>${u.nombre}</td>
                        <td style="color: var(--primary)">@${u.username}</td>
                        <td>
                            <span class="badge-status" style="background: rgba(255,255,255,0.1); color: white;">
                                ${u.rol.toUpperCase()}
                            </span>
                        </td>
                    </tr>`;
            });

            section.innerHTML = `
                <div class="panel-toolbar">
                    <h2 class="section-title">
                        <div class="section-title-icon">
                            <span class="material-symbols-rounded">admin_panel_settings</span>
                        </div>
                        Gestión de Usuarios
                    </h2>
                    <button id="btn-reset-db" class="btn-danger">Restaurar BD Inicial</button>
                </div>
                <div class="table-container">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr><th>NOMBRE</th><th>USUARIO</th><th>ROL DE ACCESO</th></tr>
                            </thead>
                            <tbody>${filas}</tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error('Error al renderizar usuarios:', err);
        }
    }
};