// js/auth.js — Autenticación con tokens tipo JWT (header.payload.firma)

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora

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

    // Autenticar usuario y generar JWT en localStorage
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
                localStorage.setItem(SESSION_KEY, this._crearToken(userData));
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
            if (roleBadge)   roleBadge.textContent  = session.rol.toUpperCase();
            if (nameDisplay) nameDisplay.textContent = session.nombre;

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
        } catch (err) {
            console.error('Error al inspeccionar token:', err.message);
        }
    }
};