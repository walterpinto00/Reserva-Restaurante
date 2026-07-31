// js/validaciones.js — Validación frontend estilo básico

// Valida el formulario de LOGIN
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
        return true;
    }
}

// Valida el formulario de NUEVA RESERVA
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
    }

    // ── Nueva Validación de Sobreventa ──
    try {
        const db = StorageModule.getDB();
        const reservaExistente = db.reservas.find(r => 
            r.mesaId === mesa && 
            r.fecha === fecha && 
            r.hora === hora && 
            (r.estado === 'pendiente' || r.estado === 'confirmada')
        );

        if (reservaExistente) {
            alert('❌ ERROR: Esta mesa ya está reservada para esa misma fecha y hora.');
            return false;
        }
    } catch (err) {
        console.warn("No se pudo validar la sobreventa: ", err);
    }

    return true;
}

// Valida un correo electrónico (mejorado respecto al básico de solo @)
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

// =====================================================
// NUEVAS VALIDACIONES (MULTIPLATO Y COMANDAS)
// =====================================================

// Valida un plato individual antes de agregarlo a la lista temporal
function validarPlatoIndividual(platoId, cantidad) {
    if (!platoId || platoId === "") {
        alert("❌ Debes seleccionar un plato de la lista.");
        return false;
    }
    
    const cant = parseInt(cantidad, 10);
    if (isNaN(cant) || cant < 1) {
        alert("❌ La cantidad debe ser al menos 1.");
        return false;
    }
    
    return true;
}

// Valida que la comanda final (el conjunto de platos) esté correcta para la mesa
function validarComandaFinal(mesaId, cantidadPlatosEnLista) {
    if (!mesaId || mesaId === "") {
        return "❌ Error: Debes seleccionar una mesa a la que asignarle los platos.";
    }

    if (cantidadPlatosEnLista === 0) {
        return "❌ Error: La comanda está vacía. Agrega al menos un plato a la lista antes de guardar.";
    }

    return null;
}
