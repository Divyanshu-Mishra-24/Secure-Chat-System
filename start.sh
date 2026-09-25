#!/bin/sh
set -eu

mkdir -p "$DATA_DIR/uploads"
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
if [ ! -f "$DATA_DIR/signal.db" ] && [ -f /app/backend/signal.db ]; then
    cp /app/backend/signal.db "$DATA_DIR/signal.db"
fi
if [ -d /app/backend/uploads ]; then
    cp -an /app/backend/uploads/. "$DATA_DIR/uploads/"
fi

cd /app/backend
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 &
cd /app/frontend
npm run start -- --hostname 127.0.0.1 --port 3000 &
nginx -g 'daemon off;'
