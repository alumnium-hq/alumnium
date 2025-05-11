import logging
from os import getenv

logger = logging.getLogger(__name__)

level = getenv("ALUMNIUM_LOG_LEVEL", None)
if level:
    logger.setLevel(level.upper())

path = getenv("ALUMNIUM_LOG_PATH", None)
if path == "stdout":
    logger.addHandler(logging.StreamHandler())
elif path:
    logger.addHandler(logging.FileHandler(path))

from .alumni import *
