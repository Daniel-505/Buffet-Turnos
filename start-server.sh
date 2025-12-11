#!/bin/bash
SERVER_IP="10.56.2.16"
SERVER_PORT="4000"

echo "🚀 Iniciando Buffet Turnos en:"
echo "🌐 http://$SERVER_IP:$SERVER_PORT"
echo ""

# Detener contenedores anteriores
sudo docker-compose down 2>/dev/null

# Construir si es necesario
sudo docker-compose build

# Ejecutar
sudo docker-compose up -d

echo ""
echo "⏳ Esperando que el servidor inicie..."
sleep 5

echo ""
echo "✅ Servidor iniciado!"
echo "📋 Verifica con:"
echo "   curl http://$SERVER_IP:$SERVER_PORT"
echo ""
echo "📊 Para ver logs:"
echo "   sudo docker-compose logs -f"
