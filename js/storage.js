// js/storage.js — Persistencia segura con cifrado XOR + firma de integridad

const DB_KEY      = 'restaurante_db';
const SESSION_KEY = 'restaurante_session';
const SECRET_KEY  = 'SENA_ReservaRest_2026_SecureKey';

const StorageModule = {

    // Cifrado XOR + Base64
    _cifrar(texto) {
        let cifrado = '';
        for (let i = 0; i < texto.length; i++) {
            cifrado += String.fromCharCode(
                texto.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length)
            );
        }
        return btoa(cifrado);
    },

    _descifrar(textoCifrado) {
        try {
            const descifrado = atob(textoCifrado);
            let texto = '';
            for (let i = 0; i < descifrado.length; i++) {
                texto += String.fromCharCode(
                    descifrado.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length)
                );
            }
            return texto;
        } catch (error) {
            console.error('Error al descifrar:', error.message);
            return null;
        }
    },

    // Firma de integridad djb2 — detecta alteraciones manuales
    _generarFirma(datos) {
        let hash = 0;
        for (let i = 0; i < datos.length; i++) {
            const char = datos.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    },

    // Leer BD desde localStorage
    getDB() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return this.initDemoDB();

        try {
            const partes = raw.split('|SIGN:');
            if (partes.length !== 2) throw new Error('Estructura corrupta');

            const jsonDescifrado = this._descifrar(partes[0]);
            if (!jsonDescifrado) throw new Error('Fallo al descifrar');

            if (this._generarFirma(jsonDescifrado) !== partes[1]) {
                throw new Error('Firma inválida — datos alterados');
            }

            return JSON.parse(jsonDescifrado);
        } catch (error) {
            console.warn('BD corrupta, restaurando:', error.message);
            return this.initDemoDB();
        }
    },

    // Guardar BD en localStorage
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

    // Datos demo iniciales: 4 usuarios, 8 mesas, 8 platos
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
