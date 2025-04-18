from typing import Any
import pytest
from xml.etree.ElementTree import fromstring
from alumnium.aria import AriaTree


@pytest.fixture
def sample_tree() -> dict[str, list[dict[str, Any]]]:
    return {
        "nodes": [
            {
                "backendDOMNodeId": 1001,
                "childIds": ["420", "69"],
                "chromeRole": {"type": "internalRole", "value": 111},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "Alumnium"},
                        }
                    ],
                    "type": "computedString",
                    "value": "Alumnium",
                },
                "nodeId": "1001",
                "role": {"type": "role", "value": "contentinfo"},
            },
            {
                "backendDOMNodeId": 420,
                "chromeRole": {"type": "internalRole", "value": 212},
                "ignored": True,
                "ignoredReasons": [
                    {
                        "name": "uninteresting",
                        "value": {"type": "boolean", "value": True},
                    }
                ],
                "name": {
                    "sources": [
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "420",
                "parentId": "1001",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 69,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 169},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "Test Done!",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "Test Done!",
                },
                "nodeId": "69",
                "parentId": "1001",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
        ]
    }


def test_tree_structure(sample_tree: dict[str, list[dict[str, Any]]]) -> None:
    tree = AriaTree(sample_tree)
    assert list(tree.cached_ids.values()) == [1001, 420, 69]
    assert isinstance(tree.tree, dict)
    assert len(tree.tree) == 1  # Only root node at top level


def test_to_xml_output(sample_tree: dict[str, list[dict[str, Any]]]) -> None:
    tree = AriaTree(sample_tree)
    xml = tree.to_xml()

    root = fromstring(xml)
    assert root.tag == "contentinfo"
    assert root.attrib["name"] == "Alumnium"
    assert root.text == "Test Done!"
