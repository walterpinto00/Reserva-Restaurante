// js/app.js — Controlador principal de la aplicación

document.addEventListener('DOMContentLoaded', () => {

    // Referencias al DOM
    const viewLogin       = document.getElementById('view-login');
    const viewDashboard   = document.getElementById('view-dashboard');
    const inputUser       = document.getElementById('login-user');
    const inputPass       = document.getElementById('login-pass');
    const btnLogin        = document.getElementById('btn-login');
    const errorMsg        = document.getElementById('login-error');
    const btnLogout       = document.getElementById('btn-logout');
    const navItems        = document.querySelectorAll('.sidebar .nav-item');
    const contentSections = document.querySelectorAll('.content-area .panel-section');
    const btnMenuToggle   = document.getElementById('btn-menu-toggle');
    const sidebarOverlay  = document.getElementById('sidebar-overlay');

    // Sidebar móvil
    function cerrarSidebar() { document.body.classList.remove('sidebar-open'); }
    function toggleSidebar()  { document.body.classList.toggle('sidebar-open'); }

    if (btnMenuToggle)  btnMenuToggle.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', cerrarSidebar);

    // Modal de Nueva Reserva
    const modalReserva = document.getElementById('modal-reserva');
    const formReserva  = document.getElementById('form-reserva');
    const modalError   = document.getElementById('modal-error');
    const selMesa      = document.getElementById('res-mesa');

    function abrirModal() {
        try {
            if (!modalReserva) return;
            formReserva.reset();
            if (modalError) modalError.textContent = '';

            // Llenar select de mesas
            if (selMesa) {
                const db = StorageModule.getDB();
                selMesa.innerHTML = '<option value="">Seleccionar mesa...</option>';
                db.mesas.forEach(m => {
                    const icono = m.estado === 'disponible' ? '🟢' : m.estado === 'ocupada' ? '🔴' : '🟡';
                    selMesa.innerHTML += `<option value="${m.id}">${icono} Mesa ${m.numero} – ${m.zona} (${m.capacidad} pax)</option>`;
                });
            }

            // Precargar fecha de hoy
            const inputFecha = document.getElementById('res-fecha');
            if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];

            modalReserva.classList.remove('hidden');
            const primerCampo = document.getElementById('res-cliente');
            if (primerCampo) primerCampo.focus();
        } catch (err) {
            console.error('Error al abrir modal:', err);
        }
    }

    function cerrarModal() {
        if (modalReserva) modalReserva.classList.add('hidden');
    }

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarSidebar();
            cerrarModal();
        }
    });

    document.addEventListener('abrirModalReserva', abrirModal);

    const modalCloseX = document.getElementById('modal-close-x');
    const modalCancel = document.getElementById('modal-cancel');
    if (modalCloseX) modalCloseX.addEventListener('click', cerrarModal);
    if (modalCancel)  modalCancel.addEventListener('click', cerrarModal);
    if (modalReserva) modalReserva.addEventListener('click', (e) => { if (e.target === modalReserva) cerrarModal(); });

    // Guardar reserva
    if (formReserva) {
        formReserva.addEventListener('submit', (e) => {
            e.preventDefault();
            if (modalError) modalError.textContent = '';

            // Validación estilo instructor
            if (!validarReserva()) return;

            try {
                const nuevaReserva = {
                    id:         'r' + Date.now(),
                    cliente:    document.getElementById('res-cliente').value.trim(),
                    mesaId:     document.getElementById('res-mesa').value,
                    fecha:      document.getElementById('res-fecha').value,
                    hora:       document.getElementById('res-hora').value,
                    comensales: parseInt(document.getElementById('res-comensales').value, 10),
                    notas:      document.getElementById('res-notas')?.value.trim() || '',
                    estado:     'pendiente',
                    creadoEn:   new Date().toISOString()
                };

                const db = StorageModule.getDB();
                db.reservas.push(nuevaReserva);
                StorageModule.saveDB(db);

                cerrarModal();
                UIModule.renderReservas();
                UIModule.renderDashboardStats();
                UIModule.renderMesas();
            } catch (err) {
                if (modalError) modalError.textContent = `⚠️ ${err.message}`;
                console.warn('Error al guardar reserva:', err.message);
            }
        });
    }

    // Inicializar la aplicación
    function initApp() {
        StorageModule.getDB();
        const session = AuthModule.getSession();

        if (session) {
            viewLogin.classList.remove('active');
            viewLogin.classList.add('hidden');
            viewDashboard.classList.remove('hidden');
            AuthModule.applyRolePermissions();
            try {
                UIModule.updateDateDisplay();

                // Asegurar que solo panel-inicio sea visible al cargar
                contentSections.forEach(sec => {
                    sec.classList.remove('active');
                    sec.classList.add('hidden');
                });
                const panelInicio = document.getElementById('panel-inicio');
                if (panelInicio) {
                    panelInicio.classList.remove('hidden');
                    panelInicio.classList.add('active');
                }

                UIModule.renderDashboardStats();

                // Actualizar badge de rol
                const roleBadge = document.getElementById('user-role-badge');
                if (roleBadge) {
                    roleBadge.textContent = session.rol;
                    roleBadge.className = 'role-badge role-' + session.rol;
                }

            } catch (err) {
                console.error('Error al cargar UI:', err);
            }
        } else {
            viewDashboard.classList.add('hidden');
            viewLogin.classList.remove('hidden');
            viewLogin.classList.add('active');
        }
    }

    // Login con validación del instructor primero
    btnLogin.addEventListener('click', () => {
        if (!validarLogin()) return; // validación básica con alert()

        const user = inputUser.value.trim();
        const pass = inputPass.value.trim();
        errorMsg.textContent = '';

        try {
            btnLogin.textContent = 'Verificando...';
            const result = AuthModule.login(user, pass);
            if (result.ok) {
                inputPass.value = '';
                initApp();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            errorMsg.textContent = error.message;
        } finally {
            btnLogin.textContent = 'ACCEDER AL SISTEMA';
        }
    });

    inputPass.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnLogin.click(); });
    btnLogout.addEventListener('click', () => AuthModule.logout());

    // Navegación entre paneles
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Desactivar todos
            navItems.forEach(nav => nav.classList.remove('active'));
            contentSections.forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');     // ocultar todos
            });

            // Activar el seleccionado
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');

            const targetId = targetBtn.getAttribute('data-target');
            const section  = document.getElementById(targetId);
            if (section) {
                section.classList.remove('hidden');  // mostrar
                section.classList.add('active');
            }

            cerrarSidebar();

            try {
                if (targetId === 'panel-inicio')    UIModule.renderDashboardStats();
                if (targetId === 'panel-mesas')     UIModule.renderMesas();
                if (targetId === 'panel-reservas')  UIModule.renderReservas();
                if (targetId === 'panel-pedidos')   UIModule.renderPedidos();
                if (targetId === 'panel-despachos') UIModule.renderDespachos();
                if (targetId === 'panel-usuarios')  UIModule.renderUsuarios();
            } catch (err) {
                console.error('Error al renderizar panel:', err);
            }
        });
    });

    // Botón resetear BD
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-reset-db') {
            if (confirm('⚠️ ¿Restaurar datos de fábrica? Esta acción es irreversible.')) {
                StorageModule.resetDB();
                AuthModule.logout();
            }
        }
    });

    // Modal de Pedidos
    const modalPedido = document.getElementById('modal-pedido');
    const formPedido  = document.getElementById('form-pedido');
    const selPedMesa  = document.getElementById('ped-mesa');
    const selPedPlato = document.getElementById('ped-plato');

    document.addEventListener('abrirModalPedido', () => {
        if (!modalPedido) return;
        formPedido.reset();
        document.getElementById('modal-pedido-error').textContent = '';

        const db = StorageModule.getDB();
        selPedMesa.innerHTML  = '<option value="">Seleccionar mesa...</option>';
        selPedPlato.innerHTML = '<option value="">Seleccionar plato...</option>';
        db.mesas.forEach(m  => selPedMesa.innerHTML  += `<option value="${m.id}">Mesa ${m.numero}</option>`);
        db.platos.forEach(p => selPedPlato.innerHTML += `<option value="${p.id}">${p.nombre} ($${p.precio}) - ${p.categoria}</option>`);

        modalPedido.classList.remove('hidden');
    });

    const cerrarModalPedido = () => modalPedido.classList.add('hidden');
    const btnPedCloseX = document.getElementById('modal-pedido-close-x');
    const btnPedCancel = document.getElementById('modal-pedido-cancel');
    if (btnPedCloseX) btnPedCloseX.addEventListener('click', cerrarModalPedido);
    if (btnPedCancel) btnPedCancel.addEventListener('click', cerrarModalPedido);

    if (formPedido) {
        formPedido.addEventListener('submit', (e) => {
            e.preventDefault();
            const mesaId   = selPedMesa.value;
            const platoId  = selPedPlato.value;
            const cantidad = parseInt(document.getElementById('ped-cantidad').value, 10);

            if (!mesaId || !platoId || cantidad < 1) {
                document.getElementById('modal-pedido-error').textContent = '⚠️ Selecciona mesa, plato y cantidad válida.';
                return;
            }

            const db = StorageModule.getDB();
            db.pedidos.push({ id: 'p' + Date.now(), mesaId, platoId, cantidad, estado: 'pendiente' });
            StorageModule.saveDB(db);
            cerrarModalPedido();
            UIModule.renderPedidos();
            UIModule.renderDashboardStats();
        });
    }

    // Funciones globales para cambio de estado (Cocina / Despacho)
    window.cambiarEstadoPedido = (id, nuevoEstado) => {
        const db = StorageModule.getDB();
        const pedido = db.pedidos.find(p => p.id === id);
        if (pedido) {
            pedido.estado = nuevoEstado;
            StorageModule.saveDB(db);
            UIModule.renderPedidos();
        }
    };

    window.crearDespacho = (pedidoId) => {
        const db     = StorageModule.getDB();
        const pedido = db.pedidos.find(p => p.id === pedidoId);
        if (pedido) {
            pedido.estado = 'despachado';
            const mesaObj = db.mesas.find(m => m.id === pedido.mesaId);
            db.despachos.push({
                id: 'd' + Date.now(),
                pedidoId: pedido.id,
                mesaNumero: mesaObj ? mesaObj.numero : 'X',
                estado: 'en_ruta'
            });
            StorageModule.saveDB(db);
            UIModule.renderPedidos();
            UIModule.renderDespachos();
            UIModule.renderDashboardStats();
        }
    };

    window.entregarDespacho = (despachoId) => {
        const db       = StorageModule.getDB();
        const despacho = db.despachos.find(d => d.id === despachoId);
        if (despacho) {
            despacho.estado = 'entregado';
            StorageModule.saveDB(db);
            UIModule.renderDespachos();
        }
    };

    initApp();
});