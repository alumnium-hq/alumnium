from os import getenv

ENV_NAME = "ALUMNIUM_TEST_PASS_THRESHOLD_PCT"


def get_pass_threshold() -> float:
    value = getenv(ENV_NAME, "100")
    try:
        threshold = float(value)
    except ValueError as error:
        raise ValueError(f"{ENV_NAME} must be a number from 0 to 100, got {value!r}") from error

    if not 0 <= threshold <= 100:
        raise ValueError(f"{ENV_NAME} must be a number from 0 to 100, got {value!r}")
    return threshold


def process_pass_threshold(passed: int, failed: int) -> int:
    accepted, message = evaluate_pass_threshold(passed, failed)

    if accepted:
        print(f"\nTest failures accepted: {message}")
        if getenv("GITHUB_ACTIONS") == "true":
            print(f"::warning title=Test failures accepted::{message}")
        return 0
    else:
        print(f"\nTest failures exceeded threshold: {message}")
        if getenv("GITHUB_ACTIONS") == "true":
            print(f"::error title=Test failures exceeded threshold::{message}")
        return 1


def evaluate_pass_threshold(passed: int, failed: int) -> tuple[bool, str]:
    threshold = get_pass_threshold()
    total = passed + failed
    pass_rate = passed / total * 100 if total else 0
    accepted = total > 0 and pass_rate >= threshold
    message = f"{passed}/{total} tests passed ({pass_rate:.2f}%, required {threshold:g}%)"
    return accepted, message
