#!/bin/bash

# --- 1. Definir la imagen a construir ---
SERVICE_NAME="app"

# --- 2. Iniciar la construcción ---
echo "⚙️ Iniciando la construcción de la imagen para el servicio: $SERVICE_NAME"

# Comando clave: construye la imagen del servicio 'app' usando docker-compose.
sudo docker-compose build $SERVICE_NAME

# --- 3. Verificar si la construcción fue exitosa ---
if [ $? -eq 0 ]; then
    echo "✅ Construcción de la imagen exitosa."
else
    echo "❌ Error: La construcción de la imagen de $SERVICE_NAME falló."
    exit 1
fi
