import json
from pathlib import Path
from typing import Any, Optional
from xml.etree.ElementTree import Element, fromstring, tostring

from filelock import FileLock
from langchain_core.caches import RETURN_VAL_TYPE, BaseCache
from langchain_core.load import dumps, loads
from xxhash import xxh3_128_hexdigest

from ..logutils import get_logger
from ..models import Model

logger = get_logger(__name__)


class FragmentsCache(BaseCache):
    """Cache that validates UI element presence before returning cached responses.

    This cache stores:
    - For planner: plan steps + union of all actor fragments
    - For actor: tool calls + element XMLs referenced

    On lookup, validates that all cached element fragments still exist in the
    current accessibility tree before returning cached responses.
    """

    def __init__(self, cache_dir: str = ".alumnium/cache"):
        """Initialize fragments cache.

        Args:
            cache_dir: Base directory for cache storage
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        # In-memory cache: (llm_string, cache_hash) -> (response, fragments, agent_type, should_save)
        self._in_memory_cache: dict[
            tuple[str, str], tuple[RETURN_VAL_TYPE, list[dict], str, bool]
        ] = {}

    def lookup(self, prompt: str, llm_string: str) -> Optional[RETURN_VAL_TYPE]:
        """Look up cached response if fragments are still valid.

        Process:
        1. Parse prompt to extract goal/step and accessibility_tree
        2. Determine agent type (planner vs actor)
        3. Hash goal/step to get cache key
        4. Load fragments.json
        5. Validate all fragments exist in current tree
        6. If valid, return cached response

        Args:
            prompt: The prompt string (JSON-encoded messages)
            llm_string: The LLM identifier string

        Returns:
            Cached response if fragments are valid, None otherwise
        """
        try:
            # Parse prompt to extract key components
            parsed = self._parse_prompt(prompt)
            if not parsed:
                return None

            goal = parsed.get("goal")
            step = parsed.get("step")
            tree_xml = parsed.get("accessibility_tree")

            if not tree_xml:
                return None

            # Determine cache key based on agent type
            is_planner = self._is_planner_prompt(parsed)
            cache_key = goal if is_planner else step
            if not cache_key:
                return None

            cache_hash = xxh3_128_hexdigest(cache_key)
            agent_type = "plans" if is_planner else "actions"

            # Check in-memory cache first
            mem_key = (llm_string, cache_hash)
            if mem_key in self._in_memory_cache:
                return_val, fragments, _, _ = self._in_memory_cache[mem_key]
                if self._validate_fragments(fragments, tree_xml):
                    logger.debug(
                        f"Fragments cache hit (in-memory) for {agent_type}: {cache_key[:50]}..."
                    )
                    self._update_usage(return_val[0].message.usage_metadata)
                    return return_val

            # Check filesystem cache
            cache_path = self._get_cache_path(agent_type, cache_hash)
            fragments_file = cache_path / "fragments.json"
            response_file = cache_path / "response.json"

            if not fragments_file.exists() or not response_file.exists():
                return None

            # Load fragments and validate
            with open(fragments_file, "r") as f:
                fragments = json.load(f)

            if not self._validate_fragments(fragments, tree_xml):
                logger.debug(
                    f"Fragments cache miss (validation failed) for {agent_type}: {cache_key[:50]}..."
                )
                return None

            # Load and return cached response
            with open(response_file, "r") as f:
                response = loads(f.read())
                self._in_memory_cache[mem_key] = ([response], fragments, agent_type, False)
                logger.debug(f"Fragments cache hit (file) for {agent_type}: {cache_key[:50]}...")
                self._update_usage(response.message.usage_metadata)
                return [response]

        except Exception as e:
            logger.debug(f"Error in fragments cache lookup: {e}")
            return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE):
        """Update cache with new response and extracted fragments.

        Process:
        1. Parse prompt to extract goal/step and accessibility_tree
        2. Determine agent type
        3. Extract element IDs from return_val
        4. Extract element XMLs from accessibility_tree
        5. Save fragments and response
        6. If actor: also update planner's fragments

        Args:
            prompt: The prompt string (JSON-encoded messages)
            llm_string: The LLM identifier string
            return_val: The LLM response to cache
        """
        try:
            # Parse prompt to extract key components
            parsed = self._parse_prompt(prompt)
            if not parsed:
                return

            goal = parsed.get("goal")
            step = parsed.get("step")
            tree_xml = parsed.get("accessibility_tree")

            if not tree_xml:
                return

            # Determine cache key based on agent type
            is_planner = self._is_planner_prompt(parsed)
            cache_key = goal if is_planner else step
            if not cache_key:
                return

            cache_hash = xxh3_128_hexdigest(cache_key)

            agent_type = "plans" if is_planner else "actions"

            if is_planner:
                # For planner, create empty fragments file (will be populated by actor updates)
                fragments = []
                self._in_memory_cache[(llm_string, cache_hash)] = (
                    return_val,
                    fragments,
                    agent_type,
                    True,
                )
            else:
                # For actor, extract element fragments
                element_ids = self._extract_element_ids(return_val)
                fragments = []
                for elem_id in element_ids:
                    try:
                        elem_attrs = self._extract_element_attrs(tree_xml, elem_id)
                        if elem_attrs:
                            fragments.append(elem_attrs)
                    except Exception as e:
                        logger.debug(f"Failed to extract element {elem_id}: {e}")

                self._in_memory_cache[(llm_string, cache_hash)] = (
                    return_val,
                    fragments,
                    agent_type,
                    True,
                )

                # Also update planner's fragments with these elements
                if goal:
                    self._update_planner_fragments(goal, fragments)

        except Exception as e:
            logger.debug(f"Error in fragments cache update: {e}")

    def save(self):
        """Flush in-memory cache to disk."""
        for (_, cache_hash), (return_val, fragments, agent_type, should_save) in self._in_memory_cache.items():
            if should_save:
                try:
                    cache_path = self._get_cache_path(agent_type, cache_hash)
                    cache_path.mkdir(parents=True, exist_ok=True)

                    lock_path = f"{cache_path}.lock"
                    lock = FileLock(lock_path, timeout=1)

                    try:
                        lock.acquire()

                        # Save response
                        response_file = cache_path / "response.json"
                        with open(response_file, "w") as f:
                            f.write(dumps(return_val[0], pretty=True))

                        # Save fragments
                        fragments_file = cache_path / "fragments.json"
                        with open(fragments_file, "w") as f:
                            json.dump(fragments, f, indent=2)

                    finally:
                        lock.release()
                        Path.unlink(Path(lock_path))

                except Exception as e:
                    logger.debug(f"Error saving fragments cache: {e}")

        self.discard()

    def discard(self):
        """Clear in-memory cache without saving."""
        self._in_memory_cache.clear()

    def clear(self, **kwargs: Any):
        """Delete all cached fragments.

        Args:
            **kwargs: Additional arguments (unused)
        """
        fragments_dir = self._get_fragments_base_dir()
        if fragments_dir.exists():
            import shutil

            shutil.rmtree(fragments_dir)
        self.discard()

    def _parse_prompt(self, prompt: str) -> Optional[dict]:
        """Extract goal/step and accessibility_tree from prompt.

        The prompt is JSON-encoded list of messages. The human message contains
        the goal/step and accessibility tree in text format.

        Args:
            prompt: JSON-encoded prompt

        Returns:
            Dict with 'goal', 'step' (optional), and 'accessibility_tree'
        """
        try:
            messages = json.loads(prompt)
            human_message = ""

            for msg in messages:
                if msg.get("kwargs", {}).get("type") == "human":
                    content = msg["kwargs"]["content"]
                    if isinstance(content, str):
                        human_message = content
                    elif isinstance(content, list):
                        # Extract text from content list
                        for item in content:
                            if isinstance(item, dict) and "text" in item:
                                human_message += item["text"]
                    break

            if not human_message:
                return None

            # Parse the human message to extract goal, step, and accessibility tree
            # Format:
            # Planner: "Given the following XML accessibility tree:\n```xml\n<tree>\n```\nOutline the actions needed to achieve the following goal: <goal>"
            # Actor: "Goal: <goal>\nStep: <step>\nWebpage ARIA tree:\n```xml\n<tree>\n```"

            result = {}

            # Extract goal
            # Actor format: "Goal: <goal>"
            if "Goal:" in human_message:
                goal_start = human_message.find("Goal:") + 5
                goal_end = human_message.find("\n", goal_start)
                if goal_end == -1:
                    goal_end = len(human_message)
                result["goal"] = human_message[goal_start:goal_end].strip()
            # Planner format: "Outline the actions needed to achieve the following goal: <goal>"
            elif "achieve the following goal:" in human_message:
                goal_start = human_message.find("achieve the following goal:") + 27
                result["goal"] = human_message[goal_start:].strip()

            # Extract step (optional, actor only)
            if "Step:" in human_message:
                step_start = human_message.find("Step:") + 5
                step_end = human_message.find("\n", step_start)
                if step_end == -1:
                    step_end = len(human_message)
                result["step"] = human_message[step_start:step_end].strip()

            # Extract accessibility tree from markdown code block
            # Both formats use: ```xml\n<tree>\n```
            if "```xml" in human_message:
                tree_start = human_message.find("```xml") + 6
                tree_end = human_message.find("```", tree_start)
                if tree_end != -1:
                    result["accessibility_tree"] = human_message[tree_start:tree_end].strip()

            return result if result else None

        except Exception as e:
            logger.debug(f"Error parsing prompt: {e}")
            return None

    def _is_planner_prompt(self, parsed: dict) -> bool:
        """Check if prompt is for planner (has goal but no step).

        Args:
            parsed: Parsed prompt dict

        Returns:
            True if planner prompt, False if actor prompt
        """
        return "goal" in parsed and "step" not in parsed

    def _extract_element_attrs(self, tree_xml: str, element_id: int) -> Optional[dict]:
        """Extract element attributes as a normalized dictionary.

        Args:
            tree_xml: Full accessibility tree XML
            element_id: The id of the element

        Returns:
            Dict of element attributes with normalized types, or None if not found
        """
        try:
            root = fromstring(f"<root>{tree_xml}</root>")
            element = root.find(f".//*[@id='{element_id}']")
            if element is None:
                return None

            # Convert XML element to normalized dict
            attrs = {"role": element.tag}
            for key, value in element.attrib.items():
                # Normalize boolean values
                if value.lower() in ("true", "false"):
                    attrs[key] = value.lower() == "true"
                # Normalize numeric values
                elif value.isdigit():
                    attrs[key] = int(value)
                # Keep as string
                else:
                    attrs[key] = value

            return attrs

        except Exception as e:
            logger.debug(f"Error extracting element attrs for id {element_id}: {e}")
            return None

    def _validate_fragments(self, fragments: list[dict], tree_xml: str) -> bool:
        """Check if all fragment elements exist in current tree.

        Validates by comparing element attributes (order-independent).

        Args:
            fragments: List of element attribute dicts
            tree_xml: Current accessibility tree XML

        Returns:
            True if all fragments found with matching attributes, False otherwise
        """
        if not fragments:
            # Empty fragments list means no elements were used (e.g., planner not yet executed)
            # This is valid for initial cache creation
            return True

        try:
            root = fromstring(f"<root>{tree_xml}</root>")

            for fragment in fragments:
                # Find element by id
                element_id = fragment.get("id")
                if element_id is None:
                    logger.debug("Fragment missing 'id' attribute")
                    return False

                element = root.find(f".//*[@id='{element_id}']")
                if element is None:
                    logger.debug(f"Element with id={element_id} not found in tree")
                    return False

                # Verify element tag matches role
                if element.tag != fragment.get("role"):
                    logger.debug(
                        f"Element role mismatch: expected {fragment.get('role')}, got {element.tag}"
                    )
                    return False

                # Check all attributes match
                for key, expected_value in fragment.items():
                    if key == "role":
                        continue

                    actual_value = element.attrib.get(key)
                    if actual_value is None:
                        logger.debug(f"Attribute '{key}' missing from element id={element_id}")
                        return False

                    # Normalize for comparison
                    if isinstance(expected_value, bool):
                        actual_value = actual_value.lower() == "true"
                    elif isinstance(expected_value, int):
                        actual_value = int(actual_value) if actual_value.isdigit() else actual_value

                    if actual_value != expected_value:
                        logger.debug(
                            f"Attribute '{key}' mismatch: expected {expected_value}, got {actual_value}"
                        )
                        return False

            return True

        except Exception as e:
            logger.debug(f"Error validating fragments: {e}")
            return False

    def _extract_element_ids(self, return_val: RETURN_VAL_TYPE) -> set[int]:
        """Extract element IDs from tool calls.

        Args:
            return_val: LLM response containing tool calls

        Returns:
            Set of element IDs used in tool calls
        """
        ids = set()
        try:
            if not return_val or len(return_val) == 0:
                return ids

            response = return_val[0]
            # Tool calls are on the message attribute of ChatGeneration
            message = getattr(response, "message", response)
            if not hasattr(message, "tool_calls"):
                return ids

            for tool_call in message.tool_calls:
                args = tool_call.get("args", {})
                if "id" in args:
                    ids.add(args["id"])
                if "from_id" in args:
                    ids.add(args["from_id"])
                if "to_id" in args:
                    ids.add(args["to_id"])

        except Exception as e:
            logger.debug(f"Error extracting element IDs: {e}")

        return ids

    def _get_cache_path(self, agent_type: str, cache_hash: str) -> Path:
        """Get cache directory path for agent type and hash.

        Args:
            agent_type: "plans" or "actions"
            cache_hash: Hash of the goal/step

        Returns:
            Path to cache directory
        """
        provider = Model.current.provider.value
        model_name = Model.current.name
        return self.cache_dir / provider / model_name / "fragments" / agent_type / cache_hash

    def _get_fragments_base_dir(self) -> Path:
        """Get base directory for fragments cache.

        Returns:
            Path to fragments base directory
        """
        provider = Model.current.provider.value
        model_name = Model.current.name
        return self.cache_dir / provider / model_name / "fragments"

    def _update_planner_fragments(self, goal: str, new_fragments: list[dict]):
        """Append fragments to planner's in-memory cache entry.

        Args:
            goal: The goal string for the planner
            new_fragments: New element attribute dicts to add
        """
        try:
            goal_hash = xxh3_128_hexdigest(goal)

            # Find and update the planner entry in in-memory cache
            # The planner entry key is (llm_string, goal_hash)
            # We need to find it by goal_hash since we don't have llm_string here
            for (llm_string, cache_hash), (return_val, fragments, agent_type, should_save) in list(
                self._in_memory_cache.items()
            ):
                if cache_hash == goal_hash and agent_type == "plans":
                    # Update planner fragments with new actor fragments (deduplicate by element id)
                    # Build dict of id -> fragment for deduplication
                    fragments_by_id = {frag["id"]: frag for frag in fragments}
                    for new_frag in new_fragments:
                        fragments_by_id[new_frag["id"]] = new_frag

                    # Update in-memory cache entry
                    self._in_memory_cache[(llm_string, cache_hash)] = (
                        return_val,
                        list(fragments_by_id.values()),
                        agent_type,
                        should_save,
                    )
                    logger.debug(f"Updated planner fragments: {len(fragments_by_id)} total fragments")
                    break

        except Exception as e:
            logger.debug(f"Error updating planner fragments: {e}")

    def _update_usage(self, usage_metadata: dict):
        """Update usage statistics.

        Args:
            usage_metadata: Dict with token usage counts
        """
        self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
        self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
        self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)
