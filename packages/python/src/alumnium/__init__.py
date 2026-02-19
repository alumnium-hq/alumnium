import logging
from os import getenv

from .server.logutils import configure_logging, get_logger

logger: logging.Logger = get_logger(__name__)
logger.addHandler(logging.NullHandler())

DELAY = float(getenv("ALUMNIUM_DELAY", 0.5))
PLANNER = getenv("ALUMNIUM_PLANNER", "true").lower() == "true"
RETRIES = int(getenv("ALUMNIUM_RETRIES", 2))

configure_logging()

from .alumni import *
from .server.models import Model, Provider
