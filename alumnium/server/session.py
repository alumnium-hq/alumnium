from typing import Any

from .accessibility import ServerChromiumTree, ServerUIAutomator2Tree, ServerXCUITestTree
from .agents.actor_agent import ActorAgent
from .agents.area_agent import AreaAgent
from .agents.locator_agent import LocatorAgent
from .agents.planner_agent import PlannerAgent
from .agents.retriever_agent import RetrieverAgent
from .cache_factory import CacheFactory
from .llm_factory import LLMFactory
from .logutils import get_logger
from .models import Model

logger = get_logger(__name__)


class Session:
    """Represents a client session with its own agent instances."""

    def __init__(
        self,
        session_id: str,
        model: Model,
        tools: dict[str, Any],
    ):
        self.session_id = session_id
        self.model = model
        self.current_tree = None  # Store the current processed tree

        self.cache = CacheFactory.create_cache()
        self.llm = LLMFactory.create_llm(model=model)
        self.llm.cache = self.cache

        self.actor_agent = ActorAgent(self.llm, tools)
        self.planner_agent = PlannerAgent(self.llm)
        self.retriever_agent = RetrieverAgent(self.llm)
        self.area_agent = AreaAgent(self.llm)
        self.locator_agent = LocatorAgent(self.llm)

        logger.info(f"Created session {session_id} with model {model.provider.value}/{model.name}")

    def process_raw_tree(self, raw_data: dict | str, automation_type: str) -> str:
        """Process raw accessibility tree data and return XML string."""
        if automation_type == "chromium":
            tree = ServerChromiumTree(raw_data)
        elif automation_type == "xcuitest":
            tree = ServerXCUITestTree(raw_data)
        elif automation_type == "uiautomator2":
            tree = ServerUIAutomator2Tree(raw_data)
        else:
            raise ValueError(f"Unknown automation type: {automation_type}")

        # Store the tree and automation type for element lookups
        self.current_tree = tree
        self._automation_type = automation_type
        logger.debug(f"  -> Stored tree with {len(tree.get_id_mappings())} elements")

        # Return XML for agents to work with
        return tree.to_xml()

    def element_by_id(self, id: int):
        """Look up element by ID from the current tree."""
        if self.current_tree is None:
            raise ValueError("No tree has been processed yet")

        # For server trees, we need to reconstruct element_by_id functionality
        # Import here to avoid circular dependency
        from ..accessibility import AccessibilityElement

        id_mappings = self.current_tree.get_id_mappings()
        if id not in id_mappings:
            raise KeyError(f"No element with id={id}")

        backend_id = id_mappings[id]

        # For XCUITest and UIAutomator2, we need more element details
        # These are stored in the tree's cached_ids
        if hasattr(self.current_tree, 'cached_ids'):
            node = self.current_tree.cached_ids.get(id)
            if node:
                element = AccessibilityElement(id=backend_id)
                # Extract properties based on tree type
                if hasattr(node, 'properties'):  # XCUITest/UIAutomator2
                    for prop in node.properties:
                        prop_name, prop_value = prop.get("name"), prop.get("value")
                        if prop_name == "name_raw":
                            element.name = prop_value
                        elif prop_name == "label_raw":
                            element.label = prop_value
                        elif prop_name == "value_raw":
                            element.value = prop_value
                        elif prop_name == "resource-id":
                            element.androidresourceid = prop_value
                        elif prop_name == "text":
                            element.androidtext = prop_value
                        elif prop_name == "content-desc":
                            element.androidcontentdesc = prop_value
                        elif prop_name == "bounds":
                            element.androidbounds = prop_value
                        elif prop_name == "class":
                            element.androidclass = prop_value
                    # Set type for mobile elements
                    if hasattr(node, 'role'):
                        if automation_type := getattr(self, '_automation_type', None):
                            if automation_type == 'xcuitest':
                                simplified_role = node.role
                                if simplified_role == "generic":
                                    element.type = "XCUIElementTypeOther"
                                else:
                                    element.type = f"XCUIElementType{simplified_role}"
                            elif automation_type == 'uiautomator2':
                                element.type = node.role
                return element

        # For Chromium, just return the backend ID
        return AccessibilityElement(id=backend_id)

    @property
    def id_mappings(self) -> dict[int, int]:
        """Get ID mappings from current tree."""
        if self.current_tree is None:
            return {}
        return self.current_tree.get_id_mappings()

    @property
    def stats(self) -> dict[str, dict[str, int]]:
        """
        Provides statistics about the usage of tokens.

        Returns:
            Two dictionaries containing the number of input tokens, output tokens, and total tokens used by all agents.
                - "total" includes the combined usage of all agents
                - "cache" includes only the usage of cached calls
        """
        return {
            "total": {
                "input_tokens": (
                    self.planner_agent.usage["input_tokens"]
                    + self.actor_agent.usage["input_tokens"]
                    + self.retriever_agent.usage["input_tokens"]
                    + self.area_agent.usage["input_tokens"]
                    + self.locator_agent.usage["input_tokens"]
                ),
                "output_tokens": (
                    self.planner_agent.usage["output_tokens"]
                    + self.actor_agent.usage["output_tokens"]
                    + self.retriever_agent.usage["output_tokens"]
                    + self.area_agent.usage["output_tokens"]
                    + self.locator_agent.usage["output_tokens"]
                ),
                "total_tokens": (
                    self.planner_agent.usage["total_tokens"]
                    + self.actor_agent.usage["total_tokens"]
                    + self.retriever_agent.usage["total_tokens"]
                    + self.area_agent.usage["total_tokens"]
                    + self.locator_agent.usage["total_tokens"]
                ),
            },
            "cache": self.cache.usage,
        }
