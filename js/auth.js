// js/auth.js
// ─────────────────────────────────────────────────────────────────────────────
//  Sistema de autenticación con tokens tipo JWT (frontend puro)
//
//  Estructura del token:   HEADER.PAYLOAD.SIGNATURE
//  Ejemplo:  eyJhbGciOiJ...  .  eyJ1c2VyIjoiYWRt...  .  3f8a2c1b
//
//  HEADER  → base64url({ alg: "XOR256-djb2", typ: "JWT" })
//  PAYLOAD → base64url({ id, username, rol, nombre, iat, exp })
//  SIGN    → djb2( header + "." + payload + SECRET_KEY )
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora de sesión activa

const AuthModule = {

    // ══════════════════════════════════════════════════════════════════════════
    //  UTILIDADES JWT
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Codifica un objeto JS a Base64URL (estándar JWT).
     * Base64URL reemplaza + → - y / → _ y elimina el padding =
     */
    _b64Encode(obj) {
        try {
            return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g,  '');
        } catch (err) {
            throw new Error('Error al codificar token: ' + err.message);
        }
    },

    /**
     * Decodifica un segmento Base64URL a objeto JS.
     */
    _b64Decode(str) {
        try {
            // Restaurar padding Base64 estándar
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4 !== 0) str += '=';
            return JSON.parse(decodeURIComponent(escape(atob(str))));
        } catch (err) {
            throw new Error('Error al decodificar token: ' + err.message);
        }
    },

    /**
     * Genera la firma djb2 sobre (header + "." + payload + SECRET_KEY).
     * Devuelve el hash como string hexadecimal.
     */
    _firmar(header, payload) {
        const datos = `${header}.${payload}.${SECRET_KEY}`;
        let hash = 5381; // semilla djb2
        for (let i = 0; i < datos.length; i++) {
            hash = ((hash << 5) + hash) ^ datos.charCodeAt(i);
            hash = hash & hash; // convierte a entero 32-bit con signo
        }
        return Math.abs(hash).toString(16); // hexadecimal positivo
    },

    /**
     * Crea un token JWT-like con los datos del usuario y expiración de 1 hora.
     * Formato: HEADER.PAYLOAD.SIGNATURE
     */
    _crearToken(userData) {
        const header = this._b64Encode({
            alg: 'XOR256-djb2',
            typ: 'JWT'
        });

        const ahora = Date.now();
        const payload = this._b64Encode({
            id:       userData.id,
            username: userData.username,
            rol:      userData.rol,
            nombre:   userData.nombre,
            iat:      ahora,                       // issued at
            exp:      ahora + TOKEN_EXPIRY_MS      // expiration
        });

        const signature = this._firmar(header, payload);
        return `${header}.${payload}.${signature}`;
    },

    /**
     * Verifica y decodifica un token:
     *  1. Valida que tenga 3 partes separadas por "."
     *  2. Recalcula la firma y la compara → detecta alteraciones
     *  3. Verifica que no haya expirado
     * @returns {object} payload del token (datos del usuario)
     * @throws {Error} si el token es inválido, alterado o expirado
     */
    _verificarToken(token) {
        // 1. Estructura
        const partes = token.split('.');
        if (partes.length !== 3) {
            throw new Error('Token malformado: se esperan 3 segmentos.');
        }

        const [header, payload, firmaRecibida] = partes;

        // 2. Integridad — recalcular firma y comparar
        const firmaEsperada = this._firmar(header, payload);
        if (firmaRecibida !== firmaEsperada) {
            throw new Error('Firma inválida: el token fue alterado manualmente.');
        }

        // 3. Decodificar payload
        const datos = this._b64Decode(payload);

        // 4. Expiración
        if (!datos.exp || Date.now() > datos.exp) {
            throw new Error('Token expirado: la sesión ha caducado.');
        }

        return datos;
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  HASH DE CONTRASEÑA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Hash simple de contraseña (desplazamiento de char + Base64).
     * Suficiente para un proyecto académico frontend.
     */
    hashPassword(pwd) {
        try {
            let hash = '';
            for (let i = 0; i < pwd.length; i++) {
                hash += String.fromCharCode(pwd.charCodeAt(i) + 10);
            }
            return btoa(hash);
        } catch (err) {
            throw new Error('Error al procesar contraseña.');
        }
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  LOGIN
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Autentica al usuario y genera un JWT-like almacenado en localStorage.
     */
    login(username, password) {
        try {
            if (!username || !password) {
                return { ok: false, error: 'Usuario y contraseña son obligatorios.' };
            }

            const db = StorageModule.getDB();
            const expectedHash = this.hashPassword(username + '123');
            const inputHash    = this.hashPassword(password);

            const user = db.usuarios.find(u => u.username === username.trim());

            if (!user) {
                return { ok: false, error: 'Usuario no encontrado en el sistema.' };
            }

            if (inputHash !== expectedHash) {
                return { ok: false, error: 'Contraseña incorrecta.' };
            }

            // ── Generar el token JWT-like ──────────────────────────────────
            try {
                const userData = {
                    id:       user.id,
                    username: user.username,
                    rol:      user.rol,
                    nombre:   user.nombre
                };

                const token = this._crearToken(userData);
                localStorage.setItem(SESSION_KEY, token);

                console.info(
                    `%c✅ JWT generado para "${user.username}" (${user.rol}) | exp: 1h`,
                    'color: #10b981; font-weight: bold;'
                );

                return { ok: true, user: userData };

            } catch (tokenErr) {
                console.error('Error al generar el token:', tokenErr.message);
                return { ok: false, error: 'Error interno al crear la sesión.' };
            }

        } catch (err) {
            console.error('Error en login:', err.message);
            return { ok: false, error: 'Error al procesar el inicio de sesión.' };
        }
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  LOGOUT
    // ══════════════════════════════════════════════════════════════════════════

    logout() {
        try {
            localStorage.removeItem(SESSION_KEY);
            console.info('Sesión cerrada. Token eliminado.');
        } catch (err) {
            console.error('Error al cerrar sesión:', err.message);
        } finally {
            window.location.reload();
        }
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  OBTENER SESIÓN ACTIVA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Lee el token del localStorage, lo verifica y retorna el payload.
     * Si el token no existe, está alterado o expiró → logout automático.
     */
    getSession() {
        try {
            const token = localStorage.getItem(SESSION_KEY);
            if (!token) return null; // no hay sesión

            // ── Verificar el token (firma + expiración) ────────────────────
            const datos = this._verificarToken(token);
            return datos;

        } catch (err) {
            // El token fue alterado o expiró → limpiar y redirigir
            console.warn(`⚠️ Sesión rechazada: ${err.message}`);
            localStorage.removeItem(SESSION_KEY);

            // Solo recarga si el dashboard está visible (evita loop en login)
            const dashboard = document.getElementById('view-dashboard');
            if (dashboard && !dashboard.classList.contains('hidden')) {
                window.location.reload();
            }
            return null;
        }
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  PERMISOS POR ROL (RBAC)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Lee la sesión y aplica visibilidad de menú según el rol del usuario.
     */
    applyRolePermissions() {
        try {
            const session = this.getSession();
            if (!session) return;

            // Mostrar nombre y rol en el topbar
            const roleBadge   = document.getElementById('user-role-badge');
            const nameDisplay = document.getElementById('user-name-display');
            if (roleBadge)   roleBadge.textContent  = session.rol.toUpperCase();
            if (nameDisplay) nameDisplay.textContent = session.nombre;

            // Mostrar tiempo restante de sesión en la consola (útil para debugging)
            const minRestantes = Math.floor((session.exp - Date.now()) / 60000);
            console.info(
                `%c🔐 Sesión activa | Rol: ${session.rol} | Expira en: ${minRestantes} min`,
                'color: #0ea5e9; font-weight: bold;'
            );

            // Ocultar/mostrar ítems del menú según data-roles
            const navItems = document.querySelectorAll('.sidebar .nav-item');
            navItems.forEach(item => {
                const rolesAttr = item.getAttribute('data-roles');
                if (!rolesAttr) return; // elemento sin restricción, se ignora

                const allowedRoles = rolesAttr.split(',').map(r => r.trim());
                if (!allowedRoles.includes(session.rol)) {
                    item.classList.add('hidden');
                } else {
                    item.classList.remove('hidden');
                }
            });

        } catch (err) {
            console.error('Error al aplicar permisos de rol:', err.message);
        }
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  INSPECCIONAR TOKEN (utilidad de desarrollo)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Decodifica y muestra el token actual en consola sin verificar firma.
     * Útil para depuración. Llamar desde consola: AuthModule.inspeccionarToken()
     */
    inspeccionarToken() {
        try {
            const token = localStorage.getItem(SESSION_KEY);
            if (!token) { console.warn('No hay token activo.'); return; }

            const partes = token.split('.');
            if (partes.length !== 3) { console.warn('Token malformado.'); return; }

            const header  = this._b64Decode(partes[0]);
            const payload = this._b64Decode(partes[1]);
            const firma   = partes[2];
            const expira  = new Date(payload.exp).toLocaleTimeString('es-CO');
            const emitido = new Date(payload.iat).toLocaleTimeString('es-CO');

            console.group('%c🔍 Inspección de Token JWT', 'color: #a78bfa; font-weight: bold;');
            console.log('HEADER  →', header);
            console.log('PAYLOAD →', { ...payload, emitido, expira });
            console.log('FIRMA   →', firma);
            console.log('TOKEN   →', token);
            console.groupEnd();
        } catch (err) {
            console.error('Error al inspeccionar token:', err.message);
        }
    }
};