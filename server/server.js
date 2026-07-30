// server/server.js
// Servidor ReservaRest: proxy Factus + autenticación + SEGURIDAD AVANZADA
require('dotenv').config({ path: __dirname + '/.env' });

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');
const fs           = require('fs');
const { emitirFactura, consultarFactura } = require('./factusService');

// ── Paquetes de Seguridad ──────────────────────────────────────────────────
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const multer       = require('multer');
const sharp        = require('sharp');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 4000;

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEGURIDAD BASE Y CABECERAS (HELMET & CORS)
// ═══════════════════════════════════════════════════════════════════════════

// Helmet protege la aplicación configurando varias cabeceras HTTP (oculta X-Powered-By, previene clickjacking, etc.)
app.use(helmet({
    contentSecurityPolicy: false, // Desactivado temporalmente si tienes scripts inline en tu HTML local
    crossOriginEmbedderPolicy: false
}));

// Middleware de logueo para depuración
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url} - Origin: ${req.get('origin') || 'N/A'}`);
    next();
});

app.use(cors({
    origin: function (origin, callback) {
        // Permitir cualquier origen local (XAMPP, Live Server, etc.)
        callback(null, true); 
    },
    credentials: true,          // Permite envío de cookies en peticiones cross-origin
    methods:     ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
}));

app.use(express.json());
// La firma secreta de cookies debe ser fuerte
const cookieSecret = process.env.COOKIE_SECRET || 'reservarest_cookie_secret_2026';
app.use(cookieParser(cookieSecret));

// ═══════════════════════════════════════════════════════════════════════════
// 2. PROTECCIÓN CONTRA CSRF (Cross-Site Request Forgery)
// ═══════════════════════════════════════════════════════════════════════════

const { invalidCsrfTokenError, generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => cookieSecret, // Secreto para firmar el token CSRF
    cookieName: "x-csrf-token",    // Nombre de la cookie donde viaja el hash
    cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/"
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    getTokenFromRequest: (req) => req.headers["x-csrf-token"], // El frontend debe enviar esto en los headers
    getSessionIdentifier: (req) => req.cookies['rr_session'] || 'guest' // Requerido en csrf-csrf v4+
});

// Endpoint para que el frontend obtenga su token CSRF antes de hacer peticiones POST
app.get('/api/csrf-token', (req, res) => {
    // generateCsrfToken usually takes req, res
    const csrfToken = generateCsrfToken(req, res);
    res.json({ csrfToken });
});

// Manejo de errores CSRF global
app.use((err, req, res, next) => {
    if (err == invalidCsrfTokenError) {
        return res.status(403).json({ error: "Token CSRF inválido o ausente. Petición bloqueada." });
    }
    next(err);
});


// ═══════════════════════════════════════════════════════════════════════════
// 3. PROTECCIÓN CONTRA FUERZA BRUTA Y BOTS (RATE LIMITING)
// ═══════════════════════════════════════════════════════════════════════════

// Límite estricto para el Login (evita ataques de diccionario/fuerza bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Máximo 5 intentos por IP
    message: { error: "Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Límite moderado para la API de Facturas/Reservas (evita bots de saturación DdoS)
const apiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 30, // Máximo 30 facturas/peticiones por IP
    message: { error: "Has excedido el límite de peticiones. Intenta más tarde." }
});


// ── Servir el frontend desde el servidor ────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Store en memoria para sesiones activas (en prod. usar Redis) ─────────────
const sesionesActivas = new Map();

function generarSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

const USUARIOS = [
    { id: 'u1', username: 'admin',    password: 'admin123',    rol: 'admin',    nombre: 'Administrador Principal' },
    { id: 'u2', username: 'mesero',   password: 'mesero123',   rol: 'mesero',   nombre: 'Carlos Mesero'           },
    { id: 'u3', username: 'cocina',   password: 'cocina123',   rol: 'cocina',   nombre: 'Ana Cocina'              },
    { id: 'u4', username: 'despacho', password: 'despacho123', rol: 'despacho', nombre: 'Luis Despacho'           }
];

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

app.get('/api/ping', (req, res) => {
    res.json({ ok: true, mensaje: 'Servidor ReservaRest activo', ts: new Date().toISOString() });
});

// Aplicamos loginLimiter SOLO a esta ruta
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password, recaptchaToken } = req.body;

    if (!username || !password || !recaptchaToken) {
        return res.status(400).json({ error: 'Faltan credenciales o no se completó el CAPTCHA' });
    }

    // 1. Validar Google reCAPTCHA
    try {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY || 'TU_CLAVE_SECRETA_RECAPTCHA';
        const recaptchaUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;
        
        const googleRes = await fetch(recaptchaUrl, { method: 'POST' });
        const googleData = await googleRes.json();

        if (!googleData.success) {
            console.error('Fallo en reCAPTCHA:', googleData['error-codes']);
            return res.status(401).json({ error: 'Validación reCAPTCHA fallida. ¿Eres un bot?' });
        }
    } catch (err) {
        console.error('Error al contactar con Google reCAPTCHA:', err);
        return res.status(500).json({ error: 'Error interno verificando seguridad' });
    }

    // 2. Validar Usuario (Base de datos en memoria para el ejercicio)
    const user = USUARIOS.find(u => u.username === username.trim());
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // 3. Crear sesión segura
    const sessionId = generarSessionId();
    const expiry    = new Date(Date.now() + 60 * 60 * 1000);

    sesionesActivas.set(sessionId, {
        id: user.id, username: user.username, rol: user.rol, nombre: user.nombre, expira: expiry.toISOString()
    });

    res.cookie('rr_session', sessionId, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: expiry, path: '/'
    });

    res.cookie('rr_user_info', JSON.stringify({ nombre: user.nombre, rol: user.rol }), {
        httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: expiry, path: '/'
    });

    res.json({ ok: true, nombre: user.nombre, rol: user.rol });
});

// Protegemos el logout con CSRF (opcional, pero buena práctica)
app.post('/api/auth/logout', doubleCsrfProtection, (req, res) => {
    const sessionId = req.cookies['rr_session'];
    if (sessionId) sesionesActivas.delete(sessionId);
    res.clearCookie('rr_session', { path: '/' });
    res.clearCookie('rr_user_info', { path: '/' });
    res.json({ ok: true, mensaje: 'Sesión cerrada' });
});


// ═══════════════════════════════════════════════════════════════════════════
// 4. SEGURIDAD DE IMÁGENES (Subida y Hotlinking)
// ═══════════════════════════════════════════════════════════════════════════

// Configuración de Multer (Almacenar en MEMORIA para procesar antes de guardar)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite estricto de 5MB
    fileFilter: (req, file, cb) => {
        // Validación estricta de MIME types
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Formato de archivo no permitido. Solo JPG, PNG, WEBP.'));
    }
});

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Endpoint protegido para subir imágenes:
// requireSession (autenticado) + doubleCsrfProtection (no falsificable) + upload.single
app.post('/api/upload-image', requireSession, doubleCsrfProtection, upload.single('imagen'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se envió ninguna imagen." });

        const nombreArchivo = `${uuidv4()}.webp`;
        const rutaDestino = path.join(UPLOADS_DIR, nombreArchivo);

        // SHARP: El verdadero sanitizador. 
        // 1. Lee el buffer (no el disco).
        // 2. Si no es una imagen válida, arroja error (evita scripts ocultos).
        // 3. Elimina metadatos EXIF (GPS, cámara) para privacidad.
        // 4. Lo convierte a un formato estándar (WebP) y lo guarda seguro.
        await sharp(req.file.buffer)
            .resize({ width: 1200, withoutEnlargement: true }) // Evita imágenes absurdamente grandes
            .webp({ quality: 80 }) // Convierte a WebP
            .withMetadata(false)   // ELIMINA metadatos maliciosos / GPS
            .toFile(rutaDestino);

        res.json({ ok: true, url: `/images/${nombreArchivo}`, mensaje: "Imagen procesada y guardada seguro." });
    } catch (error) {
        console.error("Error al procesar imagen:", error);
        res.status(500).json({ error: "Error al procesar la imagen de forma segura." });
    }
});

// Middleware Anti-Hotlinking (Solo permite que las imágenes se vean desde tu propio dominio)
const antiHotlinking = (req, res, next) => {
    const referer = req.get('Referer') || req.get('Origin');
    const dominiosPermitidos = ['http://localhost:4000', 'http://127.0.0.1:4000', 'http://localhost:5500'];
    
    // Si no hay referer (acceso directo en la barra) a veces se permite o bloquea según tu política. 
    // Aquí bloquearemos si el referer no coincide con los permitidos.
    if (referer && !dominiosPermitidos.some(d => referer.startsWith(d))) {
        return res.status(403).send('Hotlinking no permitido.');
    }
    next();
};

// Servir la carpeta estática de imágenes pasándola primero por la protección anti-hotlinking
app.use('/images', antiHotlinking, express.static(UPLOADS_DIR));


// ═══════════════════════════════════════════════════════════════════════════
//  RUTAS DE FACTURAS (protegidas con cookie, CSRF y Rate Limit)
// ═══════════════════════════════════════════════════════════════════════════

// Aplicar: requireSession (Auth), doubleCsrfProtection (CSRF), apiLimiter (Bots)
app.post('/api/facturas', requireSession, doubleCsrfProtection, apiLimiter, async (req, res) => {
    try {
        const { despacho, cliente, items } = req.body;
        if (!despacho || !items || items.length === 0) return res.status(400).json({ error: 'Faltan datos.' });

        const payload = {
            numbering_range_id: 1, reference_code: despacho.id,
            observation: `Pedido Mesa ${despacho.mesaNumero}`, payment_form: '1',
            payment_due_date: new Date().toISOString().split('T')[0], payment_method_code: '10',
            customer: {
                identification: '222222222222', dv: null, company: null, trade_name: null,
                names: cliente || 'Cliente General', address: 'Restaurante', email: 'cliente@rest.com',
                phone: '3000000000', legal_organization_id: '2', tribute_id: '21',
                identification_document_id: '3', municipality_id: '980',
            },
            items: items.map((item, i) => ({
                code_reference: `PLT-${item.platoId || i + 1}`, name: item.nombre, quantity: item.cantidad,
                discount_rate: 0, price: item.precio, tax_rate: '19.00', unit_measure_id: 70,
                standard_code_id: 1, is_excluded: 0, tribute_id: 1, withholding_taxes: []
            }))
        };

        const resultado = await emitirFactura(payload);
        res.json({
            ok: true, cufe: resultado.data?.cufe, numero: resultado.data?.number,
            qr: resultado.data?.qr_code, pdf_url: resultado.data?.public_url,
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/facturas/:numero', requireSession, apiLimiter, async (req, res) => {
    try {
        const data = await consultarFactura(req.params.numero);
        res.json({ ok: true, data });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// ── Manejador global de errores ──────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Error capturado por middleware:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

setInterval(() => {
    const ahora = Date.now();
    for (const [id, datos] of sesionesActivas.entries()) {
        if (new Date(datos.expira).getTime() < ahora) sesionesActivas.delete(id);
    }
}, 10 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor ReservaRest con SEGURIDAD AVANZADA en http://localhost:${PORT}`);
    console.log(`🛡️  Helmet, CSRF y Rate Limit: Activados`);
    console.log(`🖼️  Sanitización de Imágenes (Sharp): Lista`);
    console.log(`🧾 Integración Factus: Lista\n`);
});
