from .knowledge import HintKind, Knowledge, Layer, LessonKind, Platform

__all__ = ["HintKind", "Layer", "Learn", "LessonKind", "Platform"]


class Learn(Knowledge):
    """
    Deprecated `Alumni.learn`: the same as `Alumni.knowledge`, and calling it
    directly is the same as calling `knowledge.do()`.

    Deprecated: use `Alumni.knowledge` instead.
    """

    def __call__(self, goal: str, actions: list[str]) -> None:
        self.do(goal, actions)
