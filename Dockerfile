FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DATA_DIR=/app/data \
    PORT=8080 \
    COOKIE_SECURE=true \
    COOKIE_SAMESITE=lax \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip nginx gettext-base \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build

COPY backend ./backend
RUN pip3 install --break-system-packages --no-cache-dir -r backend/requirements.txt

COPY nginx.conf /etc/nginx/nginx.conf.template
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8080
CMD ["/app/start.sh"]
