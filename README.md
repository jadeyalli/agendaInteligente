# Agenda Inteligente

Aplicación Next.js para gestión de agendas inteligentes con autenticación basada en NextAuth y Prisma.

## Configuración

### Variables de entorno
Crea un archivo `.env.local` con al menos estas variables:

- `DATABASE_URL`: cadena de conexión a la base de datos utilizada por Prisma.
- `NEXTAUTH_SECRET`: cadena aleatoria utilizada para firmar las sesiones de NextAuth.

Variables opcionales para poblar un usuario inicial mediante el seed:

- `SEED_USER_EMAIL`: correo electrónico del usuario inicial.
- `SEED_USER_PASSWORD`: contraseña en texto plano; el script generará el hash.
- `SEED_USER_NAME`: nombre a mostrar (opcional).

Para desarrollo local con SQLite puedes usar los siguientes valores:

```bash
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_SECRET="cambia-esto"
```

### Dependencias
Instala las dependencias del proyecto:

```bash
npm install
```

### Migraciones de base de datos
Ejecuta las migraciones de Prisma para sincronizar el esquema:

```bash
npx prisma migrate dev
```

### Datos iniciales
Si definiste las variables `SEED_USER_*`, ejecuta el seed para crear el usuario base:

```bash
npx prisma db seed
```

### Desarrollo
Inicia el servidor de desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).
