const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/roleGuard');

// Rutas públicas
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Rutas protegidas (ejemplo de endpoints de reservas con roles)
router.get('/reservations', authMiddleware, (req, res) => {
  // Todos los roles pueden ver reservas (pero con filtros por rol en el servicio)
  res.json({ 
    message: `Lista de reservas para ${req.user.role}`,
    user: req.user 
  });
});

router.post('/reservations', authMiddleware, (req, res) => {
  // Meseros y admins pueden crear reservas
  if (!['administrador', 'mesero'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Solo meseros y administradores pueden crear reservas' });
  }
  res.json({ message: 'Reserva creada', user: req.user });
});

router.put('/reservations/:id/status', authMiddleware, (req, res) => {
  // Solo cocina y despachador pueden cambiar estado
  if (!['administrador', 'cocina', 'despachador'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permiso para cambiar estados' });
  }
  res.json({ message: 'Estado actualizado', user: req.user });
});

// Ruta solo para administradores (cambio de roles)
router.post('/admin/change-role', authMiddleware, isAdmin, authController.changeUserRole);

module.exports = router;