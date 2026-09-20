"""Public data, bounded navigation assistance, and synthetic appointment records."""
from collections import deque
from copy import deepcopy
from datetime import date, datetime, timezone
from functools import lru_cache
import logging
import os
from pathlib import Path
import threading
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from .db import client, execute
from .booking import router as booking_router
from .assistant import router as assistant_router
from .calendar import router as calendar_router
from .conversation import router as conversation_router
from .intake import router as intake_router
from .waitlist import router as waitlist_router

app = FastAPI(title="HokieCare", version="0.1.0", docs_url=None, openapi_url="/api/openapi.json", redoc_url=None)
app.include_router(booking_router)
app.include_router(assistant_router)
app.include_router(calendar_router)
app.include_router(conversation_router)
app.include_router(intake_router)
app.include_router(waitlist_router)
logger = logging.getLogger("hokiecare")
CACHE_SECONDS = 300
cache = {}
cache_lock = threading.Lock()
query_slots = threading.BoundedSemaphore(3)
rate_lock = threading.Lock()
requests_window = deque()


@lru_cache(maxsize=1)
def db_client():
    return client()


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # One process-wide bound avoids trusting caller-controlled forwarding headers.
    # Query cache + concurrency bound separately limit warehouse work.
    if request.url.path in ("/api/services", "/api/trends", "/api/ready") or request.url.path.startswith(("/api/booking", "/api/assistant")):
        now = time.monotonic()
        with rate_lock:
            while requests_window and requests_window[0] < now - 60:
                requests_window.popleft()
            limited = len(requests_window) >= 180
            if not limited:
                requests_window.append(now)
        if limited:
            return JSONResponse({"detail": "The demo is busy. Please retry in a minute."}, 429, headers={"Retry-After": "60"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
    if request.url.path.startswith('/api/'):
        response.headers["Cache-Control"] = "no-store"
    return response


def query_data(key, sql):
    with cache_lock:
        item = cache.get(key)
        if item and time.monotonic() - item[0] < CACHE_SECONDS:
            return deepcopy(item[1]), {**item[2], "mode": "cached", "cache_age_seconds": int(time.monotonic() - item[0])}
    if not query_slots.acquire(blocking=False):
        raise HTTPException(503, "Databricks is busy. Please try again shortly.", headers={"Retry-After": "10"})
    try:
        # Recheck after admission so concurrent requests can reuse a completed result.
        with cache_lock:
            item = cache.get(key)
            if item and time.monotonic() - item[0] < CACHE_SECONDS:
                return deepcopy(item[1]), {**item[2], "mode": "cached", "cache_age_seconds": int(time.monotonic() - item[0])}
        rows, statement = execute(db_client(), sql)
        meta = {"mode": "live", "queried_at": datetime.now(timezone.utc).isoformat(),
                "statement_id": statement, "cache_age_seconds": 0, "cache_ttl_seconds": CACHE_SECONDS,
                "provider": "Databricks SQL"}
        with cache_lock:
            cache[key] = (time.monotonic(), deepcopy(rows), meta)
        return rows, meta
    except TimeoutError:
        raise HTTPException(503, "The data warehouse is taking longer than expected. Please retry shortly.", headers={"Retry-After": "15"}) from None
    except HTTPException:
        raise
    except Exception as error:
        # Log only the error class, not SDK configuration, SQL, credentials, or request text.
        logger.warning("Data query failed: %s", type(error).__name__)
        raise HTTPException(503, "The data source is temporarily unavailable. Please try again.", headers={"Retry-After": "15"}) from None
    finally:
        query_slots.release()


@app.get('/api/health')
def health():
    """Process health: deliberately independent of warehouse cold starts."""
    return {"status": "ok", "service": "hokiecare", "version": "0.1.0",
            "commit": os.environ.get('RAILWAY_GIT_COMMIT_SHA', 'local')}


@app.get('/api/ready')
def ready():
    rows, meta = query_data('ready', 'SELECT COUNT(*) AS rows FROM workspace.hokiecare.gold_service_directory')
    if not rows or int(rows[0]['rows']) < 1:
        raise HTTPException(503, 'Service data is not ready.')
    return {"status": "ready", "data": meta}


@app.get('/api/services')
def services(category: Literal['all', 'mental-health', 'physical-health', 'wellbeing', 'accessibility'] = 'all',
             modality: Literal['all', 'in-person', 'virtual'] = 'all'):
    # Fixed bounded SQL; request filters are applied to six public records, never interpolated.
    rows, meta = query_data('services', 'SELECT * FROM workspace.hokiecare.gold_service_directory ORDER BY id LIMIT 100')
    rows = [r for r in rows if (category == 'all' or r['category'] == category)
            and (modality == 'all' or r['modality'] == modality)]
    return {"services": rows, "data": meta, "availability": "Published service information; no live appointment availability."}


def numeric(value):
    return None if value is None else float(value)


@app.get('/api/trends')
def trends(facility: Literal['Emergency Department', 'Urgent Care'] = 'Emergency Department',
           weeks: int = Query(52, ge=4, le=350)):
    rows, meta = query_data('trends', 'SELECT * FROM workspace.hokiecare.gold_new_river_trends ORDER BY week, facility LIMIT 701')
    chosen = [r for r in rows if r['facility'] == facility][-weeks:]
    points = [{**r, **{field: numeric(r[field]) for field in ['combined_pct', 'covid_pct', 'influenza_pct', 'rsv_pct']},
               'combined_count': None if r['combined_count'] is None else int(r['combined_count']),
               'count_suppressed': str(r['count_suppressed']).lower() == 'true'} for r in chosen]
    latest = points[-1] if points else None
    previous = points[-2] if len(points) > 1 else None
    difference = None
    if latest and previous and latest['combined_pct'] is not None and previous['combined_pct'] is not None:
        if (date.fromisoformat(latest['week']) - date.fromisoformat(previous['week'])).days == 7:
            difference = round(latest['combined_pct'] - previous['combined_pct'], 2)
    stale = bool(latest and (date.today() - date.fromisoformat(latest['week'])).days > 21)
    return {"points": points, "data": meta, "geography": "New River Health District, Virginia",
            "geography_level": "health district", "facility": facility,
            "metric": "Percentage of visits diagnosed with COVID-19, influenza, or RSV",
            "latest": latest, "change_percentage_points": difference, "stale": stale,
            "limitations": "District surveillance is not VT student data or a forecast. Suppressed counts remain unavailable. Historical values may be revised."}


static = Path(os.environ.get('HOKIECARE_STATIC_DIR', str(Path(__file__).resolve().parents[2] / 'frontend/dist')))
if (static / 'assets').is_dir():
    app.mount('/assets', StaticFiles(directory=static / 'assets'), name='assets')


@app.get('/hokiecare-companion.zip', include_in_schema=False)
def companion_download():
    path = static / 'hokiecare-companion.zip'
    if not path.is_file():
        raise HTTPException(404, 'Companion package is unavailable. Rebuild the frontend download.')
    return FileResponse(path, media_type='application/zip', filename='hokiecare-companion.zip')


@app.get('/', include_in_schema=False)
def index():
    if not (static / 'index.html').is_file():
        raise HTTPException(503, 'Frontend has not been built. Run npm run build in frontend.')
    return FileResponse(static / 'index.html')
