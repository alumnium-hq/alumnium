import logging
from os import getenv

from .server.logutils import configure_logging, get_logger

logger: logging.Logger = get_logger(__name__)
logger.addHandler(logging.NullHandler())

CHANGE_ANALYSIS = getenv("ALUMNIUM_CHANGE_ANALYSIS", "false").lower() == "true"
DELAY = float(getenv("ALUMNIUM_DELAY", 0.5))
EXCLUDE_ATTRIBUTES = set(filter(None, getenv("ALUMNIUM_EXCLUDE_ATTRIBUTES", "").split(",")))
PLANNER = getenv("ALUMNIUM_PLANNER", "true").lower() == "true"
RETRIES = int(getenv("ALUMNIUM_RETRIES", 2))

configure_logging()

from .alumni import *
from .server.models import Model, Provider
