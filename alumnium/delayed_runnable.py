import logging
from os import getenv
from time import sleep

from langchain_core.runnables import Runnable

logger = logging.getLogger(__name__)


class DelayedRunnable(Runnable):
    def __init__(self, runnable: Runnable, delay: int = 0):
        self.runnable = runnable
        self.delay = delay
        rpm_limit = int(getenv("ALUMNIUM_RPM_LIMIT", 0))
        if rpm_limit:
            self.delay = 60 / rpm_limit

    def invoke(self, input, config=None):
        if self.delay:
            logger.info(f"Delaying invocation for {self.delay} seconds")
            sleep(self.delay)
        return self.runnable.invoke(input, config)
