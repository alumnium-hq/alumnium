from string import whitespace
from typing import Optional, TypeAlias, Union

Data: TypeAlias = Optional[Union[str, int, float, bool, list[Union[str, int, float, bool]]]]


def loosely_typecast(value: str | list[str]) -> Data:
    """Convert string or list of strings to appropriate Python types."""
    if isinstance(value, list):
        return [loosely_typecast(item) for item in value]

    value = value.strip()

    if value.upper() == "NOOP":
        return None
    elif value.isdigit():
        return int(value)
    elif value.replace(".", "", 1).isdigit():
        return float(value)
    elif value.lower() == "true":
        return True
    elif value.lower() == "false":
        return False
    else:
        return value.strip(f"{whitespace}'\"")
