#!/bin/bash

echo "🚨 INICIO DE DESPLIEGUE 🚨"
echo "----------------------------------------------------"

# --- 1. Limpieza y Eliminación (down) ---
# Detiene y elimina TODOS los contenedores, redes y volúmenes anónimos.
echo "🛑 Paso 1/3: Deteniendo y eliminando servicios Docker antiguos..."
sudo docker-compose down --rmi local --volumes

# Verifica si el comando down fue exitoso o si no había nada que eliminar
if [ $? -ne 0 ] && [ $? -ne 1 ]; then
    echo "❌ Error al intentar limpiar los contenedores previos. Abortando."
    exit 1
fi

# --- 2. Construcción (build) ---
# Reconstruye todas las imágenes para asegurar que tengamos el código más reciente.
echo "⚙️ Paso 2/3: Reconstruyendo todas las imágenes (App, Prometheus, etc.)..."
sudo docker-compose build

if [ $? -ne 0 ]; then
    echo "❌ Error: La construcción de imágenes falló. Abortando el despliegue."
    exit 1
fi

# --- 3. Despliegue y Lanzamiento (up) ---
# Lanza todos los servicios en la nueva red.
echo "🚀 Paso 3/3: Lanzando todos los servicios en modo detached (-d)..."
# --force-recreate garantiza que se usen las imágenes recién construidas.
sudo docker-compose up -d --force-recreate

# --- 4. Verificación ---
if [ $? -eq 0 ]; then
    echo "✅ DESPLIEGUE COMPLETO EXITOSO."
    echo "Verifique el estado de los contenedores:"
    sudo docker-compose ps
    echo "🌐 URL Aplicación: http://10.56.2.16:4000"
    echo "📊 URL Prometheus: http://10.56.2.16:9090"
    echo "📈 URl Grafana: http://10.56.2.16:3001"

else
    echo "❌ Error: El despliegue falló. Revise los logs de Docker Compose."
    exit 1
fi
