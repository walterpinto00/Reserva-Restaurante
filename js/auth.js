// js/auth.js — Autenticación con tokens tipo JWT (header.payload.firma)
// + Sincronización con Cookie HTTP-Only del servidor cuando está disponible

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora
const SERVER_URL      = 'http://localhost:4000';

const AuthModule = {

    // Codifica objeto a Base64URL (formato estándar JWT)
    _b64Encode(obj) {
        try {
            return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        } catch (err) {
            throw new Error('Error al codificar token');
        }
    },

    // Decodifica segmento Base64URL a objeto
    _b64Decode(str) {
        try {
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4 !== 0) str += '=';
            return JSON.parse(decodeURIComponent(escape(atob(str))));
        } catch (err) {
            throw new Error('Error al decodificar token');
        }
    },

    // Genera firma djb2 sobre header.payload.SECRET_KEY
    _firmar(header, payload) {
        const datos = `${header}.${payload}.${SECRET_KEY}`;
        let hash = 5381;
        for (let i = 0; i < datos.length; i++) {
            hash = ((hash << 5) + hash) ^ datos.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    },

    // Crea token HEADER.PAYLOAD.FIRMA con expiración de 1 hora
    _crearToken(userData) {
        const header  = this._b64Encode({ alg: 'XOR256-djb2', typ: 'JWT' });
        const ahora   = Date.now();
        const payload = this._b64Encode({
            id: userData.id, username: userData.username,
            rol: userData.rol, nombre: userData.nombre,
            iat: ahora, exp: ahora + TOKEN_EXPIRY_MS
        });
        return `${header}.${payload}.${this._firmar(header, payload)}`;
    },

    // Verifica estructura, firma e integridad del token
    _verificarToken(token) {
        const partes = token.split('.');
        if (partes.length !== 3) throw new Error('Token malformado');

        const [header, payload, firmaRecibida] = partes;
        if (this._firmar(header, payload) !== firmaRecibida) {
            throw new Error('Firma inválida: token alterado');
        }

        const datos = this._b64Decode(payload);
        if (!datos.exp || Date.now() > datos.exp) {
            throw new Error('Token expirado');
        }
        return datos;
    },

    // Hash simple de contraseña (char shift + Base64)
    hashPassword(pwd) {
        try {
            let hash = '';
            for (let i = 0; i < pwd.length; i++) {
                hash += String.fromCharCode(pwd.charCodeAt(i) + 10);
            }
            return btoa(hash);
        } catch (err) {
            throw new Error('Error al procesar contraseña');
        }
    },

    // ── Leer cookie por nombre (solo las NO http-only) ─────────────────────
    leerCookie(nombre) {
        const cookies = document.cookie.split(';');
        for (let c of cookies) {
            const [key, val] = c.trim().split('=');
            if (key === nombre) {
                try { return JSON.parse(decodeURIComponent(val)); }
                catch { return decodeURIComponent(val); }
            }
        }
        return null;
    },

    // ── Llamar al servidor para crear la Cookie HTTP-Only ──────────────────
    async _sincronizarCookieServidor(username, password) {
        try {
            const res = await fetch(`${SERVER_URL}/api/auth/login`, {
                method:      'POST',
                credentials: 'include',   // Enviar/recibir cookies
                headers:     { 'Content-Type': 'application/json' },
                body:        JSON.stringify({ username, password }),
                signal:      AbortSignal.timeout(3000)
            });
            if (res.ok) {
                console.log('🍪 Cookie HTTP-Only generada en el servidor');
            }
        } catch (e) {
            // El servidor no está activo — la app sigue funcionando con localStorage
            console.info('ℹ️ Servidor offline: sesión solo en localStorage');
        }
    },

    // ── Autenticar usuario: localStorage + Cookie HTTP-Only (si hay servidor) ─
    login(username, password) {
        try {
            const db           = StorageModule.getDB();
            const expectedHash = this.hashPassword(username + '123');
            const inputHash    = this.hashPassword(password);
            const user         = db.usuarios.find(u => u.username === username.trim());

            if (!user) return { ok: false, error: 'Usuario no encontrado.' };
            if (inputHash !== expectedHash) return { ok: false, error: 'Contraseña incorrecta.' };

            try {
                const userData = { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre };

                // 1. Guardar JWT en localStorage (siempre funciona)
                localStorage.setItem(SESSION_KEY, this._crearToken(userData));

                // 2. Pedir cookie HTTP-Only al servidor (asíncrono, no bloquea)
                this._sincronizarCookieServidor(username, password);

                return { ok: true, user: userData };
            } catch (err) {
                return { ok: false, error: 'Error al crear la sesión.' };
            }
        } catch (err) {
            return { ok: false, error: 'Error al procesar el inicio de sesión.' };
        }
    },

    logout() {
        try {
            localStorage.removeItem(SESSION_KEY);

            // Eliminar cookie del servidor (sin bloquear)
            fetch(`${SERVER_URL}/api/auth/logout`, {
                method:      'POST',
                credentials: 'include'
            }).catch(() => {});

        } catch (err) {
            console.error('Error al cerrar sesión:', err.message);
        } finally {
            window.location.reload();
        }
    },

    // Leer y verificar sesión activa desde localStorage
    getSession() {
        try {
            const token = localStorage.getItem(SESSION_KEY);
            if (!token) return null;
            return this._verificarToken(token);
        } catch (err) {
            console.warn('Sesión rechazada:', err.message);
            localStorage.removeItem(SESSION_KEY);
            const dashboard = document.getElementById('view-dashboard');
            if (dashboard && !dashboard.classList.contains('hidden')) {
                window.location.reload();
            }
            return null;
        }
    },

    // Mostrar nombre/rol y ocultar menús según el rol del usuario
    applyRolePermissions() {
        try {
            const session = this.getSession();
            if (!session) return;

            const roleBadge   = document.getElementById('user-role-badge');
            const nameDisplay = document.getElementById('user-name-display');
            const avatar      = document.getElementById('user-avatar-initials');

            if (roleBadge)   roleBadge.textContent  = session.rol.toUpperCase();
            if (nameDisplay) nameDisplay.textContent = session.nombre;
            if (avatar)      avatar.textContent      = session.nombre.charAt(0).toUpperCase();

            document.querySelectorAll('.sidebar .nav-item').forEach(item => {
                const rolesAttr = item.getAttribute('data-roles');
                if (!rolesAttr) return;
                const roles = rolesAttr.split(',').map(r => r.trim());
                item.classList.toggle('hidden', !roles.includes(session.rol));
            });
        } catch (err) {
            console.error('Error al aplicar permisos:', err.message);
        }
    },

    // Inspeccionar token activo desde la consola del navegador
    inspeccionarToken() {
        try {
            const token = localStorage.getItem(SESSION_KEY);
            if (!token) { console.warn('No hay token activo.'); return; }
            const partes = token.split('.');
            if (partes.length !== 3) { console.warn('Token malformado.'); return; }
            console.group('🔍 Token JWT activo');
            console.log('HEADER  →', this._b64Decode(partes[0]));
            console.log('PAYLOAD →', this._b64Decode(partes[1]));
            console.log('FIRMA   →', partes[2]);
            console.groupEnd();

            // Mostrar también la cookie de UI si existe
            const cookieInfo = this.leerCookie('rr_user_info');
            if (cookieInfo) {
                console.group('🍪 Cookie de sesión (UI)');
                console.log(cookieInfo);
                console.groupEnd();
            }
        } catch (err) {
            console.error('Error al inspeccionar token:', err.message);
        }
    }
};