const bcrypt = require('bcryptjs');
const tokenService = require('../services/tokenService');
const redisClient = require('../config/redis');

// Simulación de base de datos de usuarios (en producción usa PostgreSQL/MySQL)
const USERS_DB = [
  {
    id: 1,
    email: 'admin@restaurante.com',
    password: '$2a$10$H7zPZqX5YwZ6xV9uY2zX8O5nZ5kF3jH7sK2lM9nBvCxW2qRtY3uE', // password: Admin123
    role: 'administrador',
    name: 'Juan Admin'
  },
  {
    id: 2,
    email: 'mesero@restaurante.com',
    password: '$2a$10$H7zPZqX5YwZ6xV9uY2zX8O5nZ5kF3jH7sK2lM9nBvCxW2qRtY3uE',
    role: 'mesero',
    name: 'Carlos Mesero'
  },
  {
    id: 3,
    email: 'cocina@restaurante.com',
    password: '$2a$10$H7zPZqX5YwZ6xV9uY2zX8O5nZ5kF3jH7sK2lM9nBvCxW2qRtY3uE',
    role: 'cocina',
    name: 'Maria Cocina'
  },
  {
    id: 4,
    email: 'despachador@restaurante.com',
    password: '$2a$10$H7zPZqX5YwZ6xV9uY2zX8O5nZ5kF3jH7sK2lM9nBvCxW2qRtY3uE',
    role: 'despachador',
    name: 'Pedro Despachador'
  }
];

class AuthController {
  // Login
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // 1. Validar credenciales
      const user = USERS_DB.find(u => u.email === email);
      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      // 2. Generar tokens
      const accessToken = tokenService.generateAccessToken(user.id, user.role);
      const refreshToken = await tokenService.generateRefreshToken(
        user.id,
        user.role,
        req.headers['user-agent'] || 'unknown'
      );

      // 3. Enviar refresh token en cookie HTTP-only (seguro)
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
      });

      // 4. Responder con access token y datos del usuario
      res.json({
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Refresh Token (obtener nuevo access token)
  async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ error: 'No hay refresh token' });
      }

      const tokenData = await tokenService.getRefreshTokenData(refreshToken);
      if (!tokenData) {
        return res.status(401).json({ error: 'Refresh token inválido o expirado' });
      }

      // Generar nuevo access token
      const newAccessToken = tokenService.generateAccessToken(
        tokenData.userId,
        tokenData.role
      );

      res.json({ accessToken: newAccessToken });

    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Logout
  async logout(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (refreshToken) {
        await tokenService.revokeRefreshToken(refreshToken);
      }

      res.clearCookie('refreshToken');
      res.json({ message: 'Sesión cerrada exitosamente' });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Cambio de rol (solo administradores)
  async changeUserRole(req, res) {
    try {
      const { userId, newRole } = req.body;
      
      // Validar rol permitido
      const allowedRoles = ['administrador', 'mesero', 'despachador', 'cocina'];
      if (!allowedRoles.includes(newRole)) {
        return res.status(400).json({ error: 'Rol no válido' });
      }

      // Buscar usuario (simulación)
      const user = USERS_DB.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Cambiar rol en DB
      user.role = newRole;

      // Invalidar TODOS los tokens del usuario (seguridad)
      await tokenService.revokeAllUserTokens(userId);

      res.json({ 
        message: `Rol actualizado a ${newRole} para ${user.name}`,
        user: { id: user.id, name: user.name, role: user.role }
      });

    } catch (error) {
      console.error('Change role error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = new AuthController();