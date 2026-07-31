/**
 * ==============================================================================
 *  🔐 MÓDULO MAESTRO DE SEGURIDAD (seguridad.js)
 * ==============================================================================
*/

const DB_KEY      = 'restaurante_db';
const SESSION_KEY = 'restaurante_session';
const SECRET_KEY  = 'SENA_ReservaRest_2026_SecureKey';

// ==============================================================================
// 🛡️ PARTE 1: PROTECCIÓN DE LA BASE DE DATOS (StorageModule)
// ==============================================================================
const StorageModule = {
    // Cifrado XOR + Base64 para ocultar los datos
    _cifrar(texto) {
        let cifrado = '';
        for (let i = 0; i < texto.length; i++) {
            cifrado += String.fromCharCode(texto.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
        }
        return btoa(cifrado);
    },

    // Descifrado
    _descifrar(textoCifrado) {
        try {
            const descifrado = atob(textoCifrado);
            let texto = '';
            for (let i = 0; i < descifrado.length; i++) {
                texto += String.fromCharCode(descifrado.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
            }
            return texto;
        } catch (error) {
            console.error('Error al descifrar:', error.message);
            return null;
        }
    },

    // Firma de integridad djb2 — detecta si alguien modificó el localStorage a mano
    _generarFirma(datos) {
        let hash = 0;
        for (let i = 0; i < datos.length; i++) {
            const char = datos.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    },

    getDB() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return this.initDemoDB();

        try {
            const partes = raw.split('|SIGN:');
            if (partes.length !== 2) throw new Error('Estructura corrupta');
            const jsonDescifrado = this._descifrar(partes[0]);
            if (!jsonDescifrado) throw new Error('Fallo al descifrar');
            if (this._generarFirma(jsonDescifrado) !== partes[1]) throw new Error('Firma inválida — datos alterados');
            return JSON.parse(jsonDescifrado);
        } catch (error) {
            console.warn('BD corrupta, restaurando:', error.message);
            return this.initDemoDB();
        }
    },

    saveDB(data) {
        try {
            const jsonStr = JSON.stringify(data);
            const cifrado = this._cifrar(jsonStr);
            const firma   = this._generarFirma(jsonStr);
            localStorage.setItem(DB_KEY, `${cifrado}|SIGN:${firma}`);
        } catch (error) {
            console.error('Error al guardar BD:', error.message);
        }
    },

    initDemoDB() {
        const defaultDB = {
            usuarios: [
                { id: 'u1', username: 'admin',    rol: 'admin',    nombre: 'Administrador Principal' },
                { id: 'u2', username: 'mesero',   rol: 'mesero',   nombre: 'Carlos Mesero' },
                { id: 'u3', username: 'cocina',   rol: 'cocina',   nombre: 'Ana Cocina' },
                { id: 'u4', username: 'despacho', rol: 'despacho', nombre: 'Luis Despacho' }
            ],
            mesas: [
                { id: 'm1', numero: 1, capacidad: 2, zona: 'Terraza', estado: 'disponible' },
                { id: 'm2', numero: 2, capacidad: 4, zona: 'Terraza', estado: 'disponible' },
                { id: 'm3', numero: 3, capacidad: 4, zona: 'Salón',   estado: 'disponible' },
                { id: 'm4', numero: 4, capacidad: 6, zona: 'Salón',   estado: 'disponible' },
                { id: 'm5', numero: 5, capacidad: 2, zona: 'Barra',   estado: 'disponible' },
                { id: 'm6', numero: 6, capacidad: 8, zona: 'VIP',     estado: 'disponible' },
                { id: 'm7', numero: 7, capacidad: 4, zona: 'Salón',   estado: 'disponible' },
                { id: 'm8', numero: 8, capacidad: 4, zona: 'Terraza', estado: 'disponible' }
            ],
            platos: [
                { id: 'p1', nombre: 'Ceviche Clásico',      precio: 18, categoria: 'Entrada' },
                { id: 'p2', nombre: 'Patacones con Hogao',   precio: 10, categoria: 'Entrada' },
                { id: 'p3', nombre: 'Lomo Saltado',          precio: 26, categoria: 'Fuerte'  },
                { id: 'p4', nombre: 'Bandeja Paisa',         precio: 28, categoria: 'Fuerte'  },
                { id: 'p5', nombre: 'Trucha al Ajillo',      precio: 24, categoria: 'Fuerte'  },
                { id: 'p6', nombre: 'Pasta Carbonara',       precio: 20, categoria: 'Fuerte'  },
                { id: 'p7', nombre: 'Tres Leches Artesanal', precio: 9,  categoria: 'Postre'  },
                { id: 'p8', nombre: 'Limonada de Coco',      precio: 6,  categoria: 'Bebida'  }
            ],
            reservas:  [],
            pedidos:   [],
            despachos: []
        };
        this.saveDB(defaultDB);
        return defaultDB;
    },

    resetDB() {
        localStorage.removeItem(DB_KEY);
        this.initDemoDB();
    }
};

// ==============================================================================
// 🛡️ PARTE 2: PROTECCIÓN DE SESIONES Y TOKENS (AuthModule)
// ==============================================================================
const TOKEN_EXPIRY_MS = 3 * 60 * 1000; // 3 minutos
const SERVER_URL      = 'http://localhost:4000';
let sessionTimer = null;

const AuthModule = {

    _b64Encode(obj) {
        return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    },

    _b64Decode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4 !== 0) str += '=';
        return JSON.parse(decodeURIComponent(escape(atob(str))));
    },

    _firmar(header, payload) {
        const datos = `${header}.${payload}.${SECRET_KEY}`;
        let hash = 5381;
        for (let i = 0; i < datos.length; i++) {
            hash = ((hash << 5) + hash) ^ datos.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    },

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

    _verificarToken(token) {
        const partes = token.split('.');
        if (partes.length !== 3) throw new Error('Token malformado');
        const [header, payload, firmaRecibida] = partes;
        if (this._firmar(header, payload) !== firmaRecibida) throw new Error('Firma inválida: token alterado');
        const datos = this._b64Decode(payload);
        if (!datos.exp || Date.now() > datos.exp) throw new Error('Token expirado');
        return datos;
    },

    hashPassword(pwd) {
        let hash = '';
        for (let i = 0; i < pwd.length; i++) {
            hash += String.fromCharCode(pwd.charCodeAt(i) + 10);
        }
        return btoa(hash);
    },

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

    async login(username, password, recaptchaToken) {
        try {
            const db           = StorageModule.getDB();
            const expectedHash = this.hashPassword(username + '123');
            const inputHash    = this.hashPassword(password);
            const user         = db.usuarios.find(u => u.username === username.trim());

            if (!user) return { ok: false, error: 'Usuario no encontrado.' };
            if (inputHash !== expectedHash) return { ok: false, error: 'Contraseña incorrecta.' };

            try {
                const res = await fetch(`${SERVER_URL}/api/auth/login`, {
                    method:      'POST',
                    credentials: 'include',
                    headers:     { 'Content-Type': 'application/json' },
                    body:        JSON.stringify({ username, password, recaptchaToken }),
                    signal:      AbortSignal.timeout(5000)
                });
                
                const data = await res.json();
                if (!res.ok) return { ok: false, error: data.error || 'Error de validación del servidor' };

                const userData = { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre };
                localStorage.setItem(SESSION_KEY, this._crearToken(userData));
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
                const resToken = await fetch(`${SERVER_URL}/api/csrf-token`, { credentials: 'include' });
                if (resToken.ok) {
                    const { csrfToken } = await resToken.json();
                    await fetch(`${SERVER_URL}/api/auth/logout`, {
                        method: 'POST', credentials: 'include',
                        headers: { 'x-csrf-token': csrfToken }
                    });
                }
            } catch (e) { /* ignored */ }
        } catch (err) {
            console.error('Error al cerrar sesión:', err.message);
        } finally {
            window.location.reload();
        }
    },

    getSession() {
        try {
            const token = localStorage.getItem(SESSION_KEY);
            if (!token) return null;

            const payload = this._verificarToken(token);
            if (Date.now() > payload.exp) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }

            this._iniciarTemporizadorExpiracion(payload.exp - Date.now());
            return payload;
        } catch (err) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    },

    _iniciarTemporizadorExpiracion(tiempoRestante) {
        const TIEMPO_MAXIMO_MS = 3 * 60 * 1000;
        
        const resetTimer = () => {
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(() => {
                alert("Tu sesión ha expirado por inactividad (3 minutos sin hacer nada).");
                this.logout().then(() => location.reload());
            }, TIEMPO_MAXIMO_MS);
        };

        if (!window.sessionListenersAttached) {
            window.addEventListener('mousemove', resetTimer);
            window.addEventListener('keydown', resetTimer);
            window.addEventListener('click', resetTimer);
            window.sessionListenersAttached = true;
        }
        resetTimer();
    },

    applyRolePermissions() {
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
    }
};
