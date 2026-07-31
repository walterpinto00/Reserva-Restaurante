// js/auth.js — Autenticación con tokens tipo JWT (header.payload.firma)
// + Sincronización con Cookie HTTP-Only del servidor cuando está disponible

const TOKEN_EXPIRY_MS = 3 * 60 * 1000; // 3 minutos
const SERVER_URL      = 'http://localhost:4000';
let sessionTimer = null;

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

    // ── Autenticar usuario obligando validación backend (reCAPTCHA) ───────────
    async login(username, password, recaptchaToken) {
        try {
            const db           = StorageModule.getDB();
            const expectedHash = this.hashPassword(username + '123');
            const inputHash    = this.hashPassword(password);
            const user         = db.usuarios.find(u => u.username === username.trim());

            if (!user) return { ok: false, error: 'Usuario no encontrado.' };
            if (inputHash !== expectedHash) return { ok: false, error: 'Contraseña incorrecta.' };

            try {
                // Validación estricta en el servidor para reCAPTCHA
                const res = await fetch(`${SERVER_URL}/api/auth/login`, {
                    method:      'POST',
                    credentials: 'include',
                    headers:     { 'Content-Type': 'application/json' },
                    body:        JSON.stringify({ username, password, recaptchaToken }),
                    signal:      AbortSignal.timeout(5000)
                });
                
                const data = await res.json();
                if (!res.ok) {
                    return { ok: false, error: data.error || 'Error de validación del servidor' };
                }

                const userData = { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre };

                // 1. Guardar JWT en localStorage (compatibilidad con renderizado UI actual)
                localStorage.setItem(SESSION_KEY, this._crearToken(userData));

                console.log('✅ Autenticación y reCAPTCHA exitosos');
                return { ok: true, user: userData };
            } catch (err) {
                return { ok: false, error: 'Servidor no disponible para validar CAPTCHA.' };
            }
        } catch (err) {
            return { ok: false, error: 'Error al procesar el inicio de sesión.' };
        }
    },

    async logout() {
        try {
            localStorage.removeItem(SESSION_KEY);

            try {
                // 1. Obtener Token CSRF
                const resToken = await fetch(`${SERVER_URL}/api/csrf-token`, { credentials: 'include' });
                if (resToken.ok) {
                    const { csrfToken } = await resToken.json();

                    // 2. Hacer logout con el token
                    await fetch(`${SERVER_URL}/api/auth/logout`, {
                        method:      'POST',
                        credentials: 'include',
                        headers: {
                            'x-csrf-token': csrfToken // Escudo CSRF
                        }
                    });
                }
            } catch (e) {
                // Ignorar si el servidor está caído
            }

        } catch (err) {
            console.error('Error al cerrar sesión:', err.message);
        } finally {
            window.location.reload();
        }
    },

    // ── Obtener sesión activa (valida firma y fecha de expiración) ────────────
    getSession() {
        try {
            const token = localStorage.getItem(SESSION_KEY);
            if (!token) return null;

            const payload = this._verificarToken(token);
            if (Date.now() > payload.exp) {
                console.warn('Sesión expirada.');
                localStorage.removeItem(SESSION_KEY);
                return null;
            }

            // Iniciar o reiniciar temporizador para cierre de sesión automático
            this._iniciarTemporizadorExpiracion(payload.exp - Date.now());

            return payload;
        } catch (err) {
            console.error('Token inválido:', err.message);
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    },

    // Inicia un contador para cerrar la sesión a los 3 minutos de INACTIVIDAD
    _iniciarTemporizadorExpiracion(tiempoRestante) {
        const TIEMPO_MAXIMO_MS = 3 * 60 * 1000;
        
        const resetTimer = () => {
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(() => {
                alert("Tu sesión ha expirado por inactividad (3 minutos sin hacer nada).");
                this.logout().then(() => {
                    location.reload();
                });
            }, TIEMPO_MAXIMO_MS);
        };

        // Escuchar eventos de interacción del usuario para reiniciar el reloj
        if (!window.sessionListenersAttached) {
            window.addEventListener('mousemove', resetTimer);
            window.addEventListener('keydown', resetTimer);
            window.addEventListener('click', resetTimer);
            window.sessionListenersAttached = true;
        }

        // Iniciar el reloj la primera vez
        resetTimer();
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