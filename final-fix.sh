#!/bin/bash
echo "🎯 Solución definitiva para Buffet Turnos"

# 1. Corregir schema.prisma
echo "1. 📝 Corrigiendo schema.prisma..."
if [ -f "prisma/schema.prisma" ]; then
    # Crear backup
    cp prisma/schema.prisma prisma/schema.prisma.backup
    
    # Actualizar con binaryTargets
    cat > prisma/schema.prisma << 'PRISMA'
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-1.1.x"]
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// Tus modelos aquí...
// (se copiarán del backup)
PRISMA
    
    # Copiar modelos del backup si existen
    if grep -q "model " prisma/schema.prisma.backup; then
        grep -A 1000 "model " prisma/schema.prisma.backup >> prisma/schema.prisma
    fi
    
    echo "✅ Schema.prisma actualizado"
else
    echo "⚠️  Creando schema.prisma básico..."
    mkdir -p prisma
    cat > prisma/schema.prisma << 'PRISMA'
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-1.1.x"]
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Usuario {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  nombre    String
  rol       String   @default("ALUMNO")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Turno {
  id        Int      @id @default(autoincrement())
  fecha     DateTime
  hora      String
  usuarioId Int?
  usuario   Usuario? @relation(fields: [usuarioId], references: [id])
  estado    String   @default("PENDIENTE")
  createdAt DateTime @default(now())
}
PRISMA
fi

# 2. Crear Dockerfile definitivo
echo "2. 🐳 Creando Dockerfile definitivo..."
cat > Dockerfile << 'DOCKERFILE'
FROM node:18-alpine

# Instalar OpenSSL (necesario para Prisma + MySQL)
RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar schema de Prisma
COPY prisma ./prisma/

# Generar cliente Prisma (con npx en lugar de bunx)
RUN npx prisma generate

# Copiar el resto de la aplicación
COPY . .

# Puerto expuesto
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
DOCKERFILE

# 3. Actualizar package.json si es necesario
echo "3. 📦 Verificando package.json..."
if [ -f "package.json" ]; then
    # Asegurar que tiene script "start"
    if ! grep -q '"start"' package.json; then
        echo "Agregando script start..."
        sed -i '/"scripts": {/,/}/ {
            /}/i\
    "start": "node src/index.ts || node index.js || bun run src/index.ts",
        }' package.json
    fi
fi

# 4. Reconstruir
echo "4. 🔨 Reconstruyendo contenedor..."
sudo docker-compose down 2>/dev/null || true
sudo docker-compose build

echo ""
echo "✅ ¡Todo listo!"
echo "🚀 Para iniciar: sudo docker-compose up"
echo "🌐 Accederá en: http://localhost:4000"
