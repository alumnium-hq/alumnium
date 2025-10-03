import logging

from .server.logutils import configure_logging, get_logger

logger: logging.Logger = get_logger(__name__)
logger.addHandler(logging.NullHandler())

configure_logging()

from .alumni import *
from .server.models import Model, Provider
