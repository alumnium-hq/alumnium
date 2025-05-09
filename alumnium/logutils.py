import logging
import os

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

ALUMNIUM_LOG_LEVEL = os.getenv("ALUMNIUM_LOG_LEVEL", "warning")
ALUMNIUM_LOG_PATH = os.getenv("ALUMNIUM_LOG_PATH")

Filelog_Initialized = False


def get_Logger():
    logging.basicConfig(level=ALUMNIUM_LOG_LEVEL.upper())
    return logging.getLogger()


def console_output():
    theme = Theme(
        styles={
            "logging.level.debug": "dim cyan",
            "logging.level.info": "green",
            "logging.level.warning": "yellow bold",
            "logging.level.error": "bold red",
            "logging.level.critical": "bold white on red",
        }
    )
    console = Console(theme=theme)

    consoleRichHandler = RichHandler(
        level=ALUMNIUM_LOG_LEVEL,
        log_time_format="[%d-%m-%y %H:%M:%S]",
        console=console,
        markup=True,
        rich_tracebacks=True,
        omit_repeated_times=False,
        show_level=True,
    )

    consoleLog = get_Logger()
    logging.root.handlers = []
    consoleLog.addHandler(consoleRichHandler)

    return consoleLog


def file_output():
    global Filelog_Initialized

    if not Filelog_Initialized and os.path.exists(ALUMNIUM_LOG_PATH):
        os.remove(ALUMNIUM_LOG_PATH)
        Filelog_Initialized = True

    file_logger = get_Logger()
    file_Handler = logging.FileHandler(ALUMNIUM_LOG_PATH)
    file_Formatter = logging.Formatter(fmt="%(asctime)s-%(message)s", datefmt="[%d-%m-%y %H:%M:%S]")

    logging.root.handlers = []
    file_Handler.setFormatter(file_Formatter)
    file_logger.addHandler(file_Handler)
    return file_logger
