import pytest

from alumnium.aria import AriaTree


@pytest.fixture
def tree() -> AriaTree:
    return AriaTree(
        {
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
    )


def test_to_xml(tree: AriaTree):
    assert tree.to_xml() == '<contentinfo name="Alumnium" id="1">Test Done!</contentinfo>'


def test_cached_ids(tree: AriaTree):
    assert tree.cached_ids == {1: 1001, 2: 420, 3: 69}
