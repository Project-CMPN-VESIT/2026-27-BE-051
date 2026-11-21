#!/usr/bin/env bash
set -e

ROLE="${1:-api}"

case "$ROLE" in
  api)
    echo "[entrypoint] Running Alembic migrations..."
    python -m alembic upgrade head
    echo "[entrypoint] Starting API..."
    # --proxy-headers makes uvicorn rebuild request.client.host from
    # X-Forwarded-For. Without it, everything behind a reverse proxy sees the
    # proxy's address instead of the caller's, which means:
    #   * rate limiting collapses into one shared bucket for all visitors
    #   * audit logs and refresh-token records store the proxy IP
    #
    # FORWARDED_ALLOW_IPS lists the proxy addresses whose headers may be trusted.
    # In Docker the request arrives from the bridge gateway, not 127.0.0.1, so
    # compose sets this to "*" — safe there because the port is published on
    # loopback only and nginx is the sole thing that can reach it. Never widen it
    # on a container whose port is publicly reachable: a client could then forge
    # X-Forwarded-For and bypass rate limits.
    exec uvicorn app.main:app \
      --host 0.0.0.0 --port 8000 \
      --workers "${WEB_CONCURRENCY:-4}" \
      --proxy-headers \
      --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
    ;;
  worker)
    exec celery -A app.core.celery_app:celery_app worker \
      --queues=ai,sync,celery --concurrency="${CELERY_CONCURRENCY:-2}" --loglevel=info
    ;;
  beat)
    exec celery -A app.core.celery_app:celery_app beat --loglevel=info
    ;;
  *)
    exec "$@"
    ;;
esac
