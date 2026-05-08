"""
autocast.py — keeps nest-home running on the Nest Hub automatically.

Usage:
    python autocast.py

Config: edit the constants below, then run.
"""

import ssl
import time
import logging
import pychromecast
from pychromecast.models import CastInfo, HostServiceInfo

# ── Config ────────────────────────────────────────────────────────────────────
DEVICE_NAME     = "Kitchen Display"
DEVICE_HOST     = "192.168.86.55"     # Static IP avoids mDNS discovery issues
APP_ID          = "84F51F91"
POLL_SECONDS    = 30
LAUNCH_COOLDOWN = 120                 # seconds between launch attempts
TLS_BACKOFF     = 90                  # seconds to wait after a TLS failure
MAX_BACKOFF     = 600                 # cap exponential backoff at 10 minutes
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    handlers=[
        logging.FileHandler("autocast.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


def _make_cast_info():
    return CastInfo(
        services={HostServiceInfo(DEVICE_HOST, 8009)},
        uuid=None,
        model_name="Google Nest Hub",
        friendly_name=DEVICE_NAME,
        host=DEVICE_HOST,
        port=8009,
        cast_type="cast",
        manufacturer="Google",
    )


def get_app_id():
    """Connect fresh, read app_id, disconnect. Returns (app_id, tls_error)."""
    cast = None
    try:
        cast = pychromecast.get_chromecast_from_cast_info(_make_cast_info(), zconf=None)
        cast.wait(timeout=15)
        return cast.app_id, False
    except ssl.SSLError as e:
        log.warning("TLS handshake failed: %s", e)
        return None, True
    except Exception as e:
        log.warning("Could not connect to %s: %s", DEVICE_HOST, e)
        return None, False
    finally:
        if cast:
            try:
                cast.disconnect()
            except Exception:
                pass


def launch():
    """Connect, launch the app, disconnect. Returns True if command was sent."""
    cast = None
    try:
        cast = pychromecast.get_chromecast_from_cast_info(_make_cast_info(), zconf=None)
        cast.wait(timeout=15)
        log.info("Launching Cast app %s on %s", APP_ID, DEVICE_NAME)
        cast.start_app(APP_ID, timeout=30)
        return True
    except ssl.SSLError as e:
        log.warning("TLS failure during launch: %s", e)
        return False
    except Exception as e:
        log.warning("Launch failed: %s", e)
        return False
    finally:
        if cast:
            try:
                cast.disconnect()
            except Exception:
                pass


def main():
    log.info("autocast started — device: %s  app: %s", DEVICE_NAME, APP_ID)
    last_launched   = 0.0   # monotonic
    failure_count   = 0
    last_state      = None  # track state changes to suppress log spam

    while True:
        app_id, tls_error = get_app_id()

        if tls_error:
            # Give the Nest Hub time to reset its TLS context
            log.info("Waiting %ds for device TLS recovery", TLS_BACKOFF)
            time.sleep(TLS_BACKOFF)
            continue

        if app_id is None:
            failure_count += 1
            backoff = min(POLL_SECONDS * (2 ** (failure_count - 1)), MAX_BACKOFF)
            if last_state != "unreachable":
                log.warning("Device unreachable, backing off (attempt %d)", failure_count)
                last_state = "unreachable"
            time.sleep(backoff)
            continue

        # Successful connect — reset failure counter
        failure_count = 0

        if app_id == APP_ID:
            if last_state != "running":
                log.info("App running OK")
                last_state = "running"
        else:
            now = time.monotonic()
            if now - last_launched >= LAUNCH_COOLDOWN:
                log.info("App not running (current: %s), launching …", app_id)
                launched = launch()
                if launched:
                    last_launched = now
                    last_state = "launching"
                else:
                    last_state = "launch_failed"
            else:
                remaining = int(LAUNCH_COOLDOWN - (now - last_launched))
                if last_state != "cooldown":
                    log.info("App not running, cooldown active (%ds remaining)", remaining)
                    last_state = "cooldown"

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
