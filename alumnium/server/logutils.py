import logging
import os

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

# Normalize log level (ensure upper-case)
ALUMNIUM_LOG_LEVEL_STR = os.getenv("ALUMNIUM_LOG_LEVEL", "WARNING").upper()
ALUMNIUM_LOG_PATH = os.getenv("ALUMNIUM_LOG_PATH", "stdout")

# Convert string to actual log level constant
ALUMNIUM_LOG_LEVEL = getattr(logging, ALUMNIUM_LOG_LEVEL_STR, logging.WARNING)

filelog_initialized = False

THEME = Theme(
    {
        "logging.level.debug": "dim cyan",
        "logging.level.info": "green",
        "logging.level.warning": "yellow bold",
        "logging.level.error": "bold red",
        "logging.level.critical": "bold white on red",
    }
)


def _build_console_handler() -> logging.Handler:
    console = Console(theme=THEME)
    return RichHandler(
        level=ALUMNIUM_LOG_LEVEL,
        log_time_format="[%d-%m-%y %H:%M:%S]",
        console=console,
        markup=True,
        rich_tracebacks=True,
        omit_repeated_times=False,
        show_level=True,
    )


def _build_file_handler(path: str) -> logging.Handler:
    handler = logging.FileHandler(path, mode="w")
    formatter = logging.Formatter(
        fmt="%(asctime)s %(filename)s:%(lineno)d %(levelname)s\t%(message)s",
        datefmt="[%d-%m-%y %H:%M:%S]",
    )
    handler.setFormatter(formatter)
    return handler


def configure_logging() -> logging.Logger:
    """
    Configure and return the Alumnium logger.
    """
    logger = logging.getLogger("alumnium")
    logger.setLevel(ALUMNIUM_LOG_LEVEL)
    logger.propagate = False

    if ALUMNIUM_LOG_PATH in ("stdout", "stderr"):
        logger.addHandler(_build_console_handler())
    else:
        if os.path.dirname(ALUMNIUM_LOG_PATH) != "":
            os.makedirs(os.path.dirname(ALUMNIUM_LOG_PATH), exist_ok=True)
        logger.addHandler(_build_file_handler(ALUMNIUM_LOG_PATH))

    return logger


def get_logger(name: str | None = None) -> logging.Logger:
    base = logging.getLogger("alumnium")
    return base.getChild(name) if name else base
