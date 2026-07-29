
// Validaciones frontend — estilo básico (igual que el instructor)

// ── Valida el formulario de LOGIN ─────────────────────────────────────────────
function validarLogin() {
    let usuario  = document.getElementById('login-user').value;
    let password = document.getElementById('login-pass').value;

    if (usuario === '') {
        alert('❌ El usuario no puede estar vacío');
        return false;

    } else if (usuario.includes('<') || usuario.includes('>') ||
               usuario.includes('"') || usuario.includes("'") ||
               usuario.includes('*') || usuario.includes(';')) {
        alert('❌ El usuario contiene caracteres no permitidos: < > " \' * ;');
        return false;

    } else if (password === '') {
        alert('❌ La contraseña no puede estar vacía');
        return false;

    } else if (password.length < 3) {
        alert('❌ La contraseña debe tener mínimo 3 caracteres');
        return false;

    } else if (password.includes('<') || password.includes('>') ||
               password.includes('"') || password.includes("'") ||
               password.includes('*') || password.includes(';')) {
        alert('❌ La contraseña contiene caracteres no permitidos: < > " \' * ;');
        return false;

    } else {
        return true; // ✅ Todo correcto, puede continuar
    }
}

// ── Valida el formulario de NUEVA RESERVA ────────────────────────────────────
function validarReserva() {
    let cliente    = document.getElementById('res-cliente').value;
    let mesa       = document.getElementById('res-mesa').value;
    let fecha      = document.getElementById('res-fecha').value;
    let hora       = document.getElementById('res-hora').value;
    let comensales = document.getElementById('res-comensales').value;

    if (cliente === '') {
        alert('❌ El nombre del cliente es obligatorio');
        return false;

    } else if (cliente.includes('<') || cliente.includes('>') ||
               cliente.includes('"') || cliente.includes("'") ||
               cliente.includes('*')) {
        alert('❌ El nombre contiene caracteres no permitidos: < > " \' *');
        return false;

    } else if (mesa === '') {
        alert('❌ Debes seleccionar una mesa');
        return false;

    } else if (fecha === '') {
        alert('❌ La fecha es obligatoria');
        return false;

    } else if (hora === '') {
        alert('❌ La hora es obligatoria');
        return false;

    } else if (comensales === '' || comensales < 1) {
        alert('❌ Indica al menos 1 comensal');
        return false;

    } else {
        return true; // ✅ Todo correcto
    }
}

// ── Valida un correo electrónico (estilo instructor + mejora @) ──────────────
function validarEmail() {
    let email = document.getElementById('campoDemo') 
        ? document.getElementById('campoDemo').value 
        : '';

    if (email === '') {
        alert('❌ El correo no puede estar vacío');

    } else if (!email.includes('@')) {
        alert('❌ Correo inválido: falta el @');

    } else if (!email.includes('.')) {
        alert('❌ Correo inválido: falta el dominio (.com, .co...)');

    } else if (email.startsWith('@') || email.endsWith('@')) {
        alert('❌ Correo inválido: el @ está mal ubicado');

    } else {
        alert('✅ Correo válido (frontend)');
    }
}
