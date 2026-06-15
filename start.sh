#!/bin/bash
# FMCG-цепочка — запуск сервера
# Использование: ./start.sh [порт] [пароль]

PORT=${1:-3000}
ADMIN_PASS=${2:-fmcg2024}

cd "$(dirname "$0")"

echo "======================================"
echo "  FMCG-цепочка · Деловая игра v2.2"
echo "======================================"
echo ""

# Установить зависимости если нет
if [ ! -d "node_modules" ]; then
  echo "📦 Устанавливаем зависимости..."
  npm install
  echo ""
fi

# Определить IP локальной сети
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "🚀 Запускаем сервер на порту $PORT"
echo ""
echo "  Ведущий (admin):  http://$LOCAL_IP:$PORT/"
echo "  Проектор:         http://$LOCAL_IP:$PORT/live.html"
echo "  Участники:        http://$LOCAL_IP:$PORT/"
echo ""
echo "  Пароль ведущего:  $ADMIN_PASS"
echo "  Коды команд:      R1 R2 R3 S1 S2 S3 S4 D"
echo ""
echo "  Все устройства должны быть в одной WiFi-сети."
echo "  Для остановки: Ctrl+C"
echo "======================================"
echo ""

export PORT=$PORT
export ADMIN_PASS=$ADMIN_PASS
node server.js
