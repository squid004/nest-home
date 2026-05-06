"""
autocast.py — keeps nest-home running on the Nest Hub automatically.

Usage:
    python autocast.py

Config: edit the three constants below, then run.
"""

import time
import logging
import pychromecast

# ── Config ────────────────────────────────────────────────────────────────────
DEVICE_NAME  = "Kitchen Display"   # Friendly name shown in Google Home app
APP_ID       = "84F51F91"
POLL_SECONDS = 30
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


def find_device():
    chromecasts, browser = pychromecast.get_listed_chromecasts(
        friendly_names=[DEVICE_NAME]
    )
    if not chromecasts:
        pychromecast.discovery.stop_discovery(browser)
        return None, None
    cast = chromecasts[0]
    cast.wait()
    pychromecast.discovery.stop_discovery(browser)
    return cast, cast.status


def is_our_app_running(cast):
    try:
        return cast.app_id == APP_ID
    except Exception:
        return False


def launch(cast):
    log.info("Launching Cast app %s on %s", APP_ID, DEVICE_NAME)
    cast.start_app(APP_ID)


def main():
    log.info("autocast started — device: %s  app: %s", DEVICE_NAME, APP_ID)
    cast = None

    while True:
        try:
            if cast is None:
                log.info("Searching for %s …", DEVICE_NAME)
                cast, status = find_device()
                if cast is None:
                    log.warning("Device not found, retrying in %ds", POLL_SECONDS)
                    time.sleep(POLL_SECONDS)
                    continue
                log.info("Found device (is_idle=%s)", cast.is_idle)

            cast.socket_client.ping()  # raises if connection dropped

            if not is_our_app_running(cast):
                if cast.is_idle:
                    launch(cast)
                else:
                    log.info("Device is busy (app=%s), waiting …", cast.app_id)

        except Exception as e:
            log.warning("Connection lost (%s), reconnecting …", e)
            cast = None

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
