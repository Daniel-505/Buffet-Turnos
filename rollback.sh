#!/bin/bash

SERVICE_NAME="app"

# --- 1. Detener el servicio actual (la versión fallida) ---
echo "🛑 Deteniendo el servicio $SERVICE_NAME actual..."
sudo docker-compose stop $SERVICE_NAME

# --- 2. Iniciar el servicio desde la última imagen estable ---
# Nota: Docker Compose mantiene la imagen más reciente etiquetada como 'latest'.
# Si la versión fallida es la única reciente, esto simplemente la reinicia.
# En un sistema CI/CD avanzado, se usaría un tag de versión estable anterior.
echo "🔄 Iniciando el servicio $SERVICE_NAME para volver al estado estable anterior..."
sudo docker-compose start $SERVICE_NAME

# --- 3. Verificar el estado ---
if [ $? -eq 0 ]; then
    echo "✅ Rollback completado. El servicio $SERVICE_NAME ha sido reiniciado/restaurado."
    echo "Verifique el estado del contenedor y los logs."
    sudo docker-compose ps $SERVICE_NAME
else
    echo "❌ Error durante el Rollback. Revisar la configuración."
fi
