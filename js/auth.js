// js/auth.js
const AuthModule = {
    hashPassword(pwd) {
        let hash = '';
        for (let i = 0; i < pwd.length; i++) {
            hash += String.fromCharCode(pwd.charCodeAt(i) + 10);
        }
        return btoa(hash);
    },

    login(username, password) {
        try {
            const db = StorageModule.getDB();
            const expectedPasswordHash = this.hashPassword(username + '123');
            const inputHash = this.hashPassword(password);

            const user = db.usuarios.find(u => u.username === username);

            if (user && inputHash === expectedPasswordHash) {
                const sessionData = { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre };
                try {
                    const sessionString = JSON.stringify(sessionData);
                    localStorage.setItem(SESSION_KEY, StorageModule._cifrar(sessionString));
                    return { ok: true, user: sessionData };
                } catch (error) {
                    return { ok: false, error: 'Error interno al generar token de sesión.' };
                }
            }
            return { ok: false, error: 'Credenciales inválidas o usuario no encontrado.' };
        } catch (err) {
            return { ok: false, error: 'Error al procesar el inicio de sesión.' };
        }
    },

    logout() {
        localStorage.removeItem(SESSION_KEY);
        window.location.reload();
    },

    getSession() {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;

        try {
            const descifrado = StorageModule._descifrar(raw);
            return JSON.parse(descifrado);
        } catch (error) {
            console.error('Sesión inválida detectada. Cerrando sesión de seguridad.');
            this.logout();
            return null;
        }
    },

    applyRolePermissions() {
        try {
            const session = this.getSession();
            if (!session) return;

            const roleBadge  = document.getElementById('user-role-badge');
            const nameDisplay = document.getElementById('user-name-display');
            if (roleBadge)   roleBadge.textContent  = session.rol.toUpperCase();
            if (nameDisplay) nameDisplay.textContent = session.nombre;

            // Aplicar visibilidad por rol a cada botón del menú lateral
            const navItems = document.querySelectorAll('.sidebar .nav-item');
            navItems.forEach(item => {
                const rolesAttr = item.getAttribute('data-roles');

                // ── Protección: si el elemento no tiene data-roles, se ignora ──
                if (!rolesAttr) return;

                const allowedRoles = rolesAttr.split(',').map(r => r.trim());
                if (!allowedRoles.includes(session.rol)) {
                    item.classList.add('hidden');
                } else {
                    item.classList.remove('hidden');
                }
            });
        } catch (err) {
            console.error('Error al aplicar permisos de rol:', err);
        }
    }
};