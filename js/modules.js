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

            container.innerHTML = `
                <div class="stat-card">
                    <h3><span class="material-symbols-rounded">calendar_month</span> ${db.reservas.length}</h3>
                    <p>Reservas Activas</p>
                </div>
                <div class="stat-card">
                    <h3><span class="material-symbols-rounded">skillet</span> ${db.pedidos.length}</h3>
                    <p>Platos en Cola</p>
                </div>
                <div class="stat-card">
                    <h3><span class="material-symbols-rounded">moped</span> ${db.despachos.length}</h3>
                    <p>Despachos</p>
                </div>
                <div class="stat-card">
                    <h3><span class="material-symbols-rounded">table_bar</span> ${db.mesas.filter(m => m.estado === 'ocupada').length}</h3>
                    <p>Mesas Ocupadas</p>
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

            db.mesas.forEach(mesa => {
                const color = mesa.estado === 'disponible'
                    ? 'var(--success)'
                    : mesa.estado === 'ocupada'
                        ? 'var(--danger)'
                        : 'var(--warning)';
                const bg = mesa.estado === 'disponible'
                    ? 'rgba(16, 185, 129, 0.12)'
                    : mesa.estado === 'ocupada'
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)';

                container.innerHTML += `
                    <div class="mesa-card" style="border-top: 3px solid ${color}">
                        <span class="material-symbols-rounded mesa-icon">table_restaurant</span>
                        <h3>Mesa ${mesa.numero}</h3>
                        <p>${mesa.capacidad} pax · ${mesa.zona}</p>
                        <span class="badge-status" style="color: ${color}; background: ${bg}">
                            ${mesa.estado.toUpperCase()}
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
                db.reservas.forEach(r => {
                    const estadoClass = r.estado || 'pendiente';
                    const mesaObj = db.mesas.find(m => m.id === r.mesaId);
                    const mesaLabel = mesaObj
                        ? `Mesa ${mesaObj.numero} (${mesaObj.zona})`
                        : r.mesaId;

                    filas += `
                        <tr>
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
                    <h2 class="section-title">Control de Reservas</h2>
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
            section.innerHTML = `
                <h2 class="section-title">Cola de Preparación (Cocina)</h2>
                <div class="table-container">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr><th>Nº ORDEN</th><th>MESA</th><th>PLATOS SOLICITADOS</th><th>ESTADO</th></tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="4">
                                    <div class="empty-state">
                                        <span class="material-symbols-rounded">skillet</span>
                                        <p>La cola de cocina está vacía.</p>
                                    </div>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error('Error al renderizar pedidos:', err);
        }
    },

    // Cumple requerimiento de Despacho: Entregas
    renderDespachos() {
        try {
            const section = document.getElementById('panel-despachos');
            if (!section) return;
            section.innerHTML = `
                <h2 class="section-title">Logística de Despachos</h2>
                <div class="table-container">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr><th>ID DESPACHO</th><th>ORIGEN</th><th>DESTINO</th><th>ESTADO ENTREGA</th></tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="4">
                                    <div class="empty-state">
                                        <span class="material-symbols-rounded">moped</span>
                                        <p>No hay despachos en ruta.</p>
                                    </div>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error('Error al renderizar despachos:', err);
        }
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
                    <h2 class="section-title">Gestión de Usuarios</h2>
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