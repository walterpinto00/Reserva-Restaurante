// server/server.js
// Servidor ReservaRest: proxy Factus + autenticación con Cookies HTTP-Only
require('dotenv').config({ path: __dirname + '/.env' });

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');
const { emitirFactura, consultarFactura } = require('./factusService');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS con soporte de cookies ─────────────────────────────────────────────
app.use(cors({
    origin:      ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:4000'],
    credentials: true,          // Permite envío de cookies en peticiones cross-origin
    methods:     ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'reservarest_cookie_secret_2026'));

// ── Servir el frontend desde el servidor ────────────────────────────────────
// Así index.html y el servidor comparten el mismo origin → cookies funcionan sin CORS
app.use(express.static(path.join(__dirname, '..')));

// ── Store en memoria para sesiones activas (en prod. usar Redis) ─────────────
const sesionesActivas = new Map();

// ── Función que genera una Cookie de sesión segura ──────────────────────────
function generarSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

// ── Usuarios hardcoded (igual que localStorage, mismos roles) ───────────────
const USUARIOS = [
    { id: 'u1', username: 'admin',    password: 'admin123',    rol: 'admin',    nombre: 'Administrador Principal' },
    { id: 'u2', username: 'mesero',   password: 'mesero123',   rol: 'mesero',   nombre: 'Carlos Mesero'           },
    { id: 'u3', username: 'cocina',   password: 'cocina123',   rol: 'cocina',   nombre: 'Ana Cocina'              },
    { id: 'u4', username: 'despacho', password: 'despacho123', rol: 'despacho', nombre: 'Luis Despacho'           }
];

// ── MIDDLEWARE: verificar cookie de sesión ───────────────────────────────────
function requireSession(req, res, next) {
    const sessionId = req.cookies['rr_session'];
    if (!sessionId || !sesionesActivas.has(sessionId)) {
        return res.status(401).json({ error: 'No autenticado. Cookie de sesión inválida o expirada.' });
    }
    req.usuario = sesionesActivas.get(sessionId);
    next();
}

// ═══════════════════════════════════════════════════════════════════════════
//  RUTAS DE AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════════════════

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => {
    res.json({
        ok: true,
        mensaje: 'Servidor ReservaRest activo',
        cookie_activa: !!req.cookies['rr_session'],
        ts: new Date().toISOString()
    });
});

// ── POST /api/auth/login — Login y generación de Cookie HTTP-Only ─────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    // Buscar usuario
    const user = USUARIOS.find(u => u.username === username.trim());
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Crear session ID seguro
    const sessionId = generarSessionId();
    const expiry    = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Guardar sesión en memoria del servidor
    sesionesActivas.set(sessionId, {
        id:       user.id,
        username: user.username,
        rol:      user.rol,
        nombre:   user.nombre,
        creadaEn: new Date().toISOString(),
        expira:   expiry.toISOString()
    });

    // ── Cookie 1: HTTP-Only (segura, NO accesible desde JS) ──
    // Almacena el session ID — protege contra XSS
    res.cookie('rr_session', sessionId, {
        httpOnly: true,                                   // No accesible via document.cookie
        secure:   process.env.NODE_ENV === 'production', // Solo HTTPS en producción
        sameSite: 'lax',                                 // Protección CSRF
        expires:  expiry,
        path:     '/'
    });

    // ── Cookie 2: Legible por JS (solo info de UI, NO credenciales) ──
    // El frontend la usa para mostrar nombre y rol sin llamar al servidor
    res.cookie('rr_user_info', JSON.stringify({
        nombre: user.nombre,
        rol:    user.rol
    }), {
        httpOnly: false,   // El frontend puede leerla para mostrar datos
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires:  expiry,
        path:     '/'
    });

    console.log(`✅ Login: ${user.username} (${user.rol}) — Session: ${sessionId.substring(0, 8)}...`);

    res.json({
        ok:     true,
        nombre: user.nombre,
        rol:    user.rol
    });
});

// ── POST /api/auth/logout — Destruir cookie y sesión ─────────────────────────
app.post('/api/auth/logout', (req, res) => {
    const sessionId = req.cookies['rr_session'];
    if (sessionId) {
        sesionesActivas.delete(sessionId);
        console.log(`🚪 Logout: sesión eliminada ${sessionId.substring(0, 8)}...`);
    }

    // Limpiar ambas cookies
    res.clearCookie('rr_session',   { path: '/' });
    res.clearCookie('rr_user_info', { path: '/' });

    res.json({ ok: true, mensaje: 'Sesión cerrada' });
});

// ── GET /api/auth/verificar — Verificar si la cookie de sesión es válida ─────
app.get('/api/auth/verificar', requireSession, (req, res) => {
    res.json({
        ok:      true,
        usuario: req.usuario
    });
});

// ── GET /api/auth/sesiones — Ver sesiones activas (solo admin) ────────────────
app.get('/api/auth/sesiones', requireSession, (req, res) => {
    if (req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo el administrador puede ver sesiones activas' });
    }
    const sesiones = Array.from(sesionesActivas.entries()).map(([id, datos]) => ({
        sessionId: id.substring(0, 8) + '...',
        ...datos
    }));
    res.json({ ok: true, total: sesiones.length, sesiones });
});

// ═══════════════════════════════════════════════════════════════════════════
//  RUTAS DE FACTURAS (protegidas con cookie)
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/facturas ────────────────────────────────────────────────────────
app.post('/api/facturas', requireSession, async (req, res) => {
    try {
        const { despacho, cliente, items } = req.body;

        if (!despacho || !items || items.length === 0) {
            return res.status(400).json({ error: 'Faltan datos: despacho e items son obligatorios' });
        }

        const payload = {
            numbering_range_id:  1,
            reference_code:      despacho.id,
            observation:         `Pedido Mesa ${despacho.mesaNumero} — ReservaRest`,
            payment_form:        '1',
            payment_due_date:    new Date().toISOString().split('T')[0],
            payment_method_code: '10',
            customer: {
                identification:             '222222222222',
                dv:                         null,
                company:                    null,
                trade_name:                 null,
                names:                      cliente || 'Cliente General',
                address:                    'Restaurante',
                email:                      'cliente@restaurante.com',
                phone:                      '3000000000',
                legal_organization_id:      '2',
                tribute_id:                 '21',
                identification_document_id: '3',
                municipality_id:            '980',
            },
            items: items.map((item, i) => ({
                code_reference:   `PLT-${item.platoId || i + 1}`,
                name:             item.nombre,
                quantity:         item.cantidad,
                discount_rate:    0,
                price:            item.precio,
                tax_rate:         '19.00',
                unit_measure_id:  70,
                standard_code_id: 1,
                is_excluded:      0,
                tribute_id:       1,
                withholding_taxes: []
            }))
        };

        const resultado = await emitirFactura(payload);

        console.log(`🧾 Factura emitida por ${req.usuario.username} — Mesa ${despacho.mesaNumero}`);

        res.json({
            ok:      true,
            cufe:    resultado.data?.cufe,
            numero:  resultado.data?.number,
            qr:      resultado.data?.qr_code,
            pdf_url: resultado.data?.public_url,
        });

    } catch (err) {
        console.error('❌ Error emitiendo factura:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/facturas/:numero ──────────────────────────────────────────────────
app.get('/api/facturas/:numero', requireSession, async (req, res) => {
    try {
        const data = await consultarFactura(req.params.numero);
        res.json({ ok: true, data });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// ── Manejador global de errores ──────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Error no capturado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Limpiar sesiones expiradas cada 10 minutos ───────────────────────────────
setInterval(() => {
    const ahora = Date.now();
    for (const [id, datos] of sesionesActivas.entries()) {
        if (new Date(datos.expira).getTime() < ahora) {
            sesionesActivas.delete(id);
            console.log(`🗑️ Sesión expirada eliminada: ${id.substring(0, 8)}...`);
        }
    }
}, 10 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor ReservaRest corriendo en http://localhost:${PORT}`);
    console.log(`🍽️  Abre la app en: http://localhost:${PORT}/index.html`);
    console.log(`🧾 Integración Factus: activada`);
    console.log(`🍪 Cookies HTTP-Only: activadas\n`);
});
