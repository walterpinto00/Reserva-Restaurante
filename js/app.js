// js/app.js
document.addEventListener('DOMContentLoaded', () => {

    // ── Referencias al DOM ─────────────────────────────────────────────────
    const viewLogin       = document.getElementById('view-login');
    const viewDashboard   = document.getElementById('view-dashboard');
    const inputUser       = document.getElementById('login-user');
    const inputPass       = document.getElementById('login-pass');
    const btnLogin        = document.getElementById('btn-login');
    const errorMsg        = document.getElementById('login-error');
    const btnLogout       = document.getElementById('btn-logout');
    const navItems        = document.querySelectorAll('.sidebar .nav-item');
    const contentSections = document.querySelectorAll('.content-area .panel-section');

    // ── Sidebar móvil ──────────────────────────────────────────────────────
    const btnMenuToggle  = document.getElementById('btn-menu-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function abrirSidebar() {
        document.body.classList.add('sidebar-open');
    }
    function cerrarSidebar() {
        document.body.classList.remove('sidebar-open');
    }
    function toggleSidebar() {
        document.body.classList.toggle('sidebar-open');
    }

    if (btnMenuToggle)  btnMenuToggle.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', cerrarSidebar);


    // ── Modal de Nueva Reserva ─────────────────────────────────────────────
    const modalReserva = document.getElementById('modal-reserva');
    const formReserva  = document.getElementById('form-reserva');
    const modalError   = document.getElementById('modal-error');
    const modalCloseX  = document.getElementById('modal-close-x');
    const modalCancel  = document.getElementById('modal-cancel');
    const selMesa      = document.getElementById('res-mesa');

    function abrirModal() {
        try {
            if (!modalReserva) return;

            // Limpiar formulario y errores
            formReserva.reset();
            if (modalError) modalError.textContent = '';

            // Poblar el <select> con TODAS las mesas de la BD
            if (selMesa) {
                const db = StorageModule.getDB();
                selMesa.innerHTML = '<option value="">Seleccionar mesa...</option>';
                db.mesas.forEach(m => {
                    const icono = m.estado === 'disponible' ? '🟢' : m.estado === 'ocupada' ? '🔴' : '🟡';
                    selMesa.innerHTML += `<option value="${m.id}">
                        ${icono} Mesa ${m.numero} – ${m.zona} (${m.capacidad} pax)
                    </option>`;
                });
            }

            // Precargar fecha de hoy
            const inputFecha = document.getElementById('res-fecha');
            if (inputFecha) {
                inputFecha.value = new Date().toISOString().split('T')[0];
            }

            modalReserva.classList.remove('hidden');
            const primerCampo = document.getElementById('res-cliente');
            if (primerCampo) primerCampo.focus();
        } catch (err) {
            console.error('Error al abrir el modal:', err);
        }
    }

    function cerrarModal() {
        try {
            if (!modalReserva) return;
            modalReserva.classList.add('hidden');
        } catch (err) {
            console.error('Error al cerrar el modal:', err);
        }
    }

    // Cerrar modal y sidebar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarSidebar();
            if (modalReserva && !modalReserva.classList.contains('hidden')) {
                cerrarModal();
            }
        }
    });

    // Escuchar evento personalizado disparado desde modules.js
    document.addEventListener('abrirModalReserva', abrirModal);

    if (modalCloseX) modalCloseX.addEventListener('click', cerrarModal);
    if (modalCancel)  modalCancel.addEventListener('click', cerrarModal);

    // Cerrar al hacer clic en el overlay (fuera del modal-box)
    if (modalReserva) {
        modalReserva.addEventListener('click', (e) => {
            if (e.target === modalReserva) cerrarModal();
        });
    }

    // ── Guardar la reserva ─────────────────────────────────────────────────
    if (formReserva) {
        formReserva.addEventListener('submit', (e) => {
            e.preventDefault();
            if (modalError) modalError.textContent = '';

            try {
                const cliente    = document.getElementById('res-cliente')?.value.trim()       || '';
                const mesaId     = document.getElementById('res-mesa')?.value                 || '';
                const fecha      = document.getElementById('res-fecha')?.value                || '';
                const hora       = document.getElementById('res-hora')?.value                 || '';
                const comensales = parseInt(document.getElementById('res-comensales')?.value, 10) || 0;
                const notas      = document.getElementById('res-notas')?.value.trim()         || '';

                // Validaciones
                if (!cliente)        throw new Error('El nombre del cliente es obligatorio.');
                if (!mesaId)         throw new Error('Debes seleccionar una mesa.');
                if (!fecha)          throw new Error('La fecha es obligatoria.');
                if (!hora)           throw new Error('La hora es obligatoria.');
                if (comensales < 1)  throw new Error('Indica al menos 1 comensal.');

                const nuevaReserva = {
                    id:        'r' + Date.now(),
                    cliente,
                    mesaId,
                    fecha,
                    hora,
                    comensales,
                    notas,
                    estado:    'pendiente',
                    creadoEn:  new Date().toISOString()
                };

                // Persistir en localStorage
                const db = StorageModule.getDB();
                db.reservas.push(nuevaReserva);
                StorageModule.saveDB(db);

                // Actualizar UI sin recargar la página
                cerrarModal();
                UIModule.renderReservas();
                UIModule.renderDashboardStats();
                UIModule.renderMesas();

            } catch (err) {
                if (modalError) modalError.textContent = `⚠️ ${err.message}`;
                console.warn('Validación de reserva:', err.message);
            }
        });
    }

    // ── Inicialización ─────────────────────────────────────────────────────
    function initApp() {
        StorageModule.getDB();
        const session = AuthModule.getSession();

        if (session) {
            viewLogin.classList.remove('active');
            viewLogin.classList.add('hidden');
            viewDashboard.classList.remove('hidden');

            AuthModule.applyRolePermissions();

            try {
                if (typeof UIModule !== 'undefined') {
                    UIModule.updateDateDisplay();
                    UIModule.renderDashboardStats();
                    UIModule.renderMesas();
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

    // ── Login ──────────────────────────────────────────────────────────────
    btnLogin.addEventListener('click', () => {
        const user = inputUser.value.trim();
        const pass = inputPass.value.trim();

        errorMsg.textContent = '';
        if (!user || !pass) { errorMsg.textContent = 'Completa todos los campos.'; return; }

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
    btnLogout.addEventListener('click', () => { AuthModule.logout(); });

    // ── Enrutamiento de paneles ────────────────────────────────────────────
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            navItems.forEach(nav => nav.classList.remove('active'));
            contentSections.forEach(sec => sec.classList.remove('active'));

            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');

            const targetId = targetBtn.getAttribute('data-target');
            const section  = document.getElementById(targetId);
            if (section) section.classList.add('active');

            // Cerrar sidebar automáticamente en móvil al navegar
            cerrarSidebar();

            try {
                if (typeof UIModule !== 'undefined') {
                    if (targetId === 'panel-inicio')    UIModule.renderDashboardStats();
                    if (targetId === 'panel-mesas')     UIModule.renderMesas();
                    if (targetId === 'panel-reservas')  UIModule.renderReservas();
                    if (targetId === 'panel-pedidos')   UIModule.renderPedidos();
                    if (targetId === 'panel-despachos') UIModule.renderDespachos();
                    if (targetId === 'panel-usuarios')  UIModule.renderUsuarios();
                }
            } catch (err) {
                console.error('Error al renderizar panel:', err);
            }
        });
    });

    // ── Delegación: botón resetear BD ─────────────────────────────────────
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-reset-db') {
            if (confirm('⚠️ ¿Restaurar datos de fábrica? Esta acción es irreversible.')) {
                StorageModule.resetDB();
                AuthModule.logout();
            }
        }
    });

    initApp();
});