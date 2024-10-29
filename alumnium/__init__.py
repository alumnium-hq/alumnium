import logging
import os
import sys

if os.getenv("ALUMNIUM_DEBUG", "0") == "1":
    logger = logging.getLogger(__name__)
    logger.setLevel(level=logging.DEBUG)
    logger.addHandler(logging.StreamHandler(sys.stdout))


from .alumni import *
