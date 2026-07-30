// server/factusService.js
// Servicio que maneja la autenticación y comunicación con la API de Factus
require('dotenv').config();
const crypto = require('crypto');

const FACTUS_BASE = process.env.FACTUS_BASE_URL || 'https://api.factus.com.co';

let _accessToken  = null;
let _refreshToken = null;
let _tokenExpiry  = null;

// ── 1. Obtener token de Factus ────────────────────────────────────────────────
async function autenticarFactus() {
    const body = new URLSearchParams({
        grant_type:    'password',
        client_id:     process.env.FACTUS_CLIENT_ID,
        client_secret: process.env.FACTUS_CLIENT_SECRET,
        username:      process.env.FACTUS_USERNAME,
        password:      process.env.FACTUS_PASSWORD,
    });

    const res = await fetch(`${FACTUS_BASE}/oauth/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Error autenticando Factus: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    _accessToken  = data.access_token;
    _refreshToken = data.refresh_token;
    _tokenExpiry  = Date.now() + (data.expires_in - 60) * 1000; // renovar 1 min antes

    console.log('✅ Token Factus obtenido — expira en', data.expires_in, 's');
    return _accessToken;
}

// ── 2. Renovar token con refresh_token ───────────────────────────────────────
async function renovarToken() {
    const body = new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     process.env.FACTUS_CLIENT_ID,
        client_secret: process.env.FACTUS_CLIENT_SECRET,
        refresh_token: _refreshToken,
    });

    const res = await fetch(`${FACTUS_BASE}/oauth/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    if (!res.ok) {
        // Si el refresh falla, autenticar de nuevo desde cero
        return autenticarFactus();
    }

    const data    = await res.json();
    _accessToken  = data.access_token;
    _refreshToken = data.refresh_token;
    _tokenExpiry  = Date.now() + (data.expires_in - 60) * 1000;
    return _accessToken;
}

// ── 3. Obtener token válido (auto-renova si está por vencer) ──────────────────
async function getToken() {
    if (!_accessToken || Date.now() >= _tokenExpiry) {
        if (_refreshToken) {
            return renovarToken();
        }
        return autenticarFactus();
    }
    return _accessToken;
}

// ── 4. Emitir factura electrónica en Factus ───────────────────────────────────
async function emitirFactura(datosFactura) {
    // 🔥 MODO SIMULACIÓN PARA EVALUACIÓN SIN CREDENCIALES 🔥
    if (process.env.FACTUS_CLIENT_ID === 'TU_CLIENT_ID_AQUI') {
        console.log('⚠️ Ejecutando Factus en MODO SIMULACIÓN (Credenciales por defecto)');
        await new Promise(resolve => setTimeout(resolve, 1200)); // Retraso realista
        return {
            data: {
                cufe: 'SIMULADO-' + crypto.randomUUID(),
                number: 'SETP-' + Math.floor(Math.random() * 10000),
                qr_code: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SIMULACION',
                public_url: 'https://www.dian.gov.co/simulacion'
            }
        };
    }

    const token = await getToken();

    const res = await fetch(`${FACTUS_BASE}/v1/bills/validate`, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json',
            'Accept':        'application/json',
        },
        body: JSON.stringify(datosFactura)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(`Error Factus: ${JSON.stringify(err)}`);
    }

    return res.json();
}

// ── 5. Consultar factura por número ──────────────────────────────────────────
async function consultarFactura(numero) {
    if (process.env.FACTUS_CLIENT_ID === 'TU_CLIENT_ID_AQUI') {
        return { data: { number: numero, status: 'Simulada - Pagada' } };
    }

    const token = await getToken();

    const res = await fetch(`${FACTUS_BASE}/v1/bills/${numero}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept':        'application/json',
        }
    });

    if (!res.ok) throw new Error(`Factura ${numero} no encontrada`);
    return res.json();
}

module.exports = { emitirFactura, consultarFactura, getToken };
