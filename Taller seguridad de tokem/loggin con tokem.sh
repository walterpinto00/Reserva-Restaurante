POST /api/auth/login
Body: { "email": "admin@restaurante.com", "password": "Admin123" }

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "Juan Admin",
    "email": "admin@restaurante.com",
    "role": "administrador"
  }
}