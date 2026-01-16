from pathlib import Path

from pytest import fixture

from alumnium.server.accessibility import AccessibilityTreeDiff, ServerChromiumAccessibilityTree


@fixture
def accessibility_tree_before() -> str:
    with open(Path(__file__).parent.parent.parent / "fixtures/accessibility_tree_diff_1.xml", "r") as f:
        xml = f.read()
    return ServerChromiumAccessibilityTree(xml).to_xml()


@fixture
def accessibility_tree_after() -> str:
    with open(Path(__file__).parent.parent.parent / "fixtures/accessibility_tree_diff_2.xml", "r") as f:
        xml = f.read()
    return ServerChromiumAccessibilityTree(xml).to_xml()


def test_compute_returns_unified_diff_for_different_xml():
    diff = AccessibilityTreeDiff(
        "<root><button id='1'>Click me</button></root>",
        "<root><button id='1'>Submit</button></root>",
    )

    assert (
        diff.compute()
        == """
--- before
+++ after
@@ -1 +1 @@
-<root><button id='1'>Click me</button></root>
+<root><button id='1'>Submit</button></root>
        """.strip()
    )


def test_compute_returns_empty_string_for_identical_xml():
    xml = "<root><button id='1'>Click me</button></root>"
    diff = AccessibilityTreeDiff(xml, xml)

    assert diff.compute() == ""


def test_compute_handles_multiline_xml():
    diff = AccessibilityTreeDiff(
        """
<root>
  <button id='1'>Click me</button>
  <input id='2' />
</root>
        """.strip(),
        """
<root>
  <button id='1'>Submit</button>
  <input id='2' />
</root>
        """.strip(),
    )

    assert (
        diff.compute()
        == """
--- before
+++ after
@@ -1,4 +1,4 @@
 <root>
-  <button id='1'>Click me</button>
+  <button id='1'>Submit</button>
   <input id='2' />
 </root>
        """.strip()
    )


def test_compute_large_diff(accessibility_tree_before, accessibility_tree_after):
    diff = AccessibilityTreeDiff(
        accessibility_tree_before,
        accessibility_tree_after,
    )

    assert diff.compute() != "", "Expected a non-empty diff for large differing XMLs"


def test_compute_shows_full_tree_as_addition():
    xml = "<root><button id='1'>Click me</button></root>"
    diff = AccessibilityTreeDiff("", xml)

    assert (
        diff.compute()
        == """
--- before
+++ after
@@ -0,0 +1 @@
+<root><button id='1'>Click me</button></root>
        """.strip()
    )


def test_compute_shows_full_tree_as_deletion():
    xml = "<root><button id='1'>Click me</button></root>"
    diff = AccessibilityTreeDiff(xml, "")

    assert (
        diff.compute()
        == """
--- before
+++ after
@@ -1 +0,0 @@
-<root><button id='1'>Click me</button></root>
        """.strip()
    )
