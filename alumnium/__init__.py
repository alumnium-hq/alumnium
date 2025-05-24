import logging
from os import getenv

from .logutils import configure_logging, get_logger

logger: logging.Logger = get_logger(__name__)
logger.addHandler(logging.NullHandler())

configure_logging()

from .alumni import *
