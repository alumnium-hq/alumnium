import logging
from os import getenv
from sys import stdout


logger = logging.getLogger(__name__)

level = getenv("ALUMNIUM_LOG_LEVEL", None)
if getenv("ALUMNIUM_DEBUG", "0") == "1":
    level = "debug"

if level:
    logger.setLevel(level.upper())
    logger.addHandler(logging.StreamHandler(stdout))


from .alumni import *
