import json
from pathlib import Path
from typing import Any, Optional
from xml.etree.ElementTree import fromstring

from filelock import FileLock
from langchain_core.caches import RETURN_VAL_TYPE, BaseCache
from langchain_core.load import dumps, loads
from rapidfuzz import fuzz
from xxhash import xxh3_128_hexdigest

from ..logutils import get_logger
from ..models import Model

logger = get_logger(__name__)

FUZZY_MATCH_THRESHOLD = 95


class ElementsCache(BaseCache):
    """Cache that validates UI element presence before returning cached responses.

    This cache stores:
    - For planner: plan steps + union of all actor elements
    - For actor: tool calls + element XMLs referenced

    On lookup, resolves cached elements to current IDs in the accessibility tree
    and unmasks the cached response before returning it.
    """

    _ID_FIELDS = ("id", "from_id", "to_id")

    def __init__(self, cache_dir: str = ".alumnium/cache"):
        """Initialize elements cache.

        Args:
            cache_dir: Base directory for cache storage
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        self._app: str = "unknown"
        # In-memory cache:
        # (llm_string, cache_hash, app) -> (masked_json, elements, agent_type, app, instruction, should_save)
        self._in_memory_cache: dict[tuple[str, str, str], tuple[str, list[dict], str, str, dict, bool]] = {}

    @property
    def app(self) -> str:
        return self._app

    @app.setter
    def app(self, value: str) -> None:
        self._app = value

    def lookup(self, prompt: str, llm_string: str) -> Optional[RETURN_VAL_TYPE]:
        """Look up cached response if elements are still valid.

        Process:
        1. Parse prompt to extract goal/step and accessibility_tree
        2. Determine agent type (planner vs actor)
        3. Hash goal/step to get cache key
        4. Load elements.json
        5. Resolve all elements to current IDs in tree
        6. If valid, unmask and return cached response

        Args:
            prompt: The prompt string (JSON-encoded messages)
            llm_string: The LLM identifier string

        Returns:
            Cached response if elements are valid, None otherwise
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

            # Check in-memory cache — exact match first, then fuzzy
            mem_key = (llm_string, cache_hash, self._app)
            if mem_key not in self._in_memory_cache:
                fuzzy_mem_key = self._fuzzy_memory_lookup(cache_key, agent_type)
                if fuzzy_mem_key is not None:
                    mem_key = fuzzy_mem_key

            if mem_key in self._in_memory_cache:
                masked_json, elements, _, _, _, _ = self._in_memory_cache[mem_key]
                mask_to_id = self._resolve_elements(elements, tree_xml)
                if mask_to_id is not None:
                    unmasked_json = self._unmask_response(masked_json, mask_to_id)
                    response = loads(unmasked_json)
                    logger.debug(f"Elements cache hit (in-memory) for {agent_type}: {cache_key[:50]}...")
                    self._update_usage(response.message.usage_metadata)
                    return [response]

            # Check filesystem cache
            cache_path = self._get_cache_path(agent_type, cache_hash)
            elements_file = cache_path / "elements.json"
            response_file = cache_path / "response.json"

            if not elements_file.exists() or not response_file.exists():
                fuzzy_hash = self._fuzzy_lookup_hash(cache_key, agent_type)
                if fuzzy_hash is None:
                    return None
                cache_path = self._get_cache_path(agent_type, fuzzy_hash)
                elements_file = cache_path / "elements.json"
                response_file = cache_path / "response.json"
                if not elements_file.exists() or not response_file.exists():
                    return None

            # Load elements and resolve
            with open(elements_file, "r") as f:
                elements = json.load(f)

            mask_to_id = self._resolve_elements(elements, tree_xml)
            if mask_to_id is None:
                logger.debug(f"Elements cache miss (resolution failed) for {agent_type}: {cache_key[:50]}...")
                return None

            # Load and return cached response
            with open(response_file, "r") as f:
                masked_json = f.read()

            unmasked_json = self._unmask_response(masked_json, mask_to_id)
            response = loads(unmasked_json)
            self._in_memory_cache[mem_key] = (masked_json, elements, agent_type, self._app, {}, False)
            logger.debug(f"Elements cache hit (file) for {agent_type}: {cache_key[:50]}...")
            self._update_usage(response.message.usage_metadata)
            return [response]

        except Exception as e:
            logger.debug(f"Error in elements cache lookup: {e}")
            return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE):
        """Update cache with new response and extracted fragments.

        Process:
        1. Parse prompt to extract goal/step and accessibility_tree
        2. Determine agent type
        3. Extract element IDs from return_val
        4. Extract element XMLs from accessibility_tree
        5. Mask response IDs and store
        6. If actor: also update planner's elements

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
                # Don't cache empty plans — content must be non-empty
                plan_msg = getattr(return_val[0], "message", return_val[0])
                plan_content = getattr(plan_msg, "content", None)
                if not plan_content:
                    logger.debug(f"Skipping planner cache update: empty plan content for goal: {goal[:50]}...")
                    return

                # For planner, create empty elements file (will be populated by actor updates)
                elements = []
                instruction = {"goal": goal}
                response_json = dumps(return_val[0], pretty=True)
                self._in_memory_cache[(llm_string, cache_hash, self._app)] = (
                    response_json,
                    elements,
                    agent_type,
                    self._app,
                    instruction,
                    True,
                )
            else:
                # Don't cache empty actions — actor must have returned tool calls
                actor_msg = getattr(return_val[0], "message", return_val[0])
                if not getattr(actor_msg, "tool_calls", None):
                    logger.debug(f"Skipping actor cache update: no tool calls for step: {step[:50]}...")
                    return

                # For actor, extract element elements
                element_ids = self._extract_element_ids(return_val)
                elements = []
                for elem_id in element_ids:
                    try:
                        elem_attrs = self._extract_element_attrs(tree_xml, elem_id)
                        if elem_attrs:
                            elements.append(elem_attrs)
                    except Exception as e:
                        logger.debug(f"Failed to extract element {elem_id}: {e}")

                if not elements:
                    logger.debug(f"Skipping actor cache update: no elements extracted for step: {step[:50]}...")
                    return

                response_json = dumps(return_val[0], pretty=True)
                masked_json = self._mask_response(response_json, element_ids)

                instruction = {"goal": goal, "step": step}
                self._in_memory_cache[(llm_string, cache_hash, self._app)] = (
                    masked_json,
                    elements,
                    agent_type,
                    self._app,
                    instruction,
                    True,
                )

                # Also update planner's elements with these elements
                if goal:
                    self._update_planner_elements(goal, elements)

        except Exception as e:
            logger.debug(f"Error in elements cache update: {e}")

    def save(self):
        """Flush in-memory cache to disk."""
        for (_, cache_hash, _), (
            masked_json,
            elements,
            agent_type,
            app,
            instruction,
            should_save,
        ) in self._in_memory_cache.items():
            if should_save:
                try:
                    cache_path = self._get_cache_path(agent_type, cache_hash, app=app)
                    cache_path.mkdir(parents=True, exist_ok=True)

                    lock_path = f"{cache_path}.lock"
                    lock = FileLock(lock_path, timeout=1)

                    try:
                        lock.acquire()

                        # Save instruction (the goal/step used to compute the hash)
                        instruction_file = cache_path / "instruction.json"
                        with open(instruction_file, "w") as f:
                            json.dump(instruction, f, indent=2)

                        # Save response (already a JSON string)
                        response_file = cache_path / "response.json"
                        with open(response_file, "w") as f:
                            f.write(masked_json)

                        # Save elements
                        elements_file = cache_path / "elements.json"
                        with open(elements_file, "w") as f:
                            json.dump(elements, f, indent=2)

                    finally:
                        lock.release()
                        Path(lock_path).unlink(missing_ok=True)

                except Exception as e:
                    logger.debug(f"Error saving elements cache: {e}")

        self.discard()

    def discard(self):
        """Clear in-memory cache without saving."""
        self._in_memory_cache.clear()

    def clear(self, **kwargs: Any):
        """Delete all cached elements.

        Args:
            **kwargs: Additional arguments (unused)
        """
        elements_dir = self._get_elements_base_dir()
        if elements_dir.exists():
            import shutil

            shutil.rmtree(elements_dir)
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
            # Planner: "Given the following XML accessibility tree:\n```xml\n<tree>\n```\n
            #           Outline the actions needed to achieve the following goal: <goal>"
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

    @staticmethod
    def _xpath_string_literal(value: str) -> str:
        """Return a valid XPath 1.0 string literal for value, handling embedded quotes.

        XPath 1.0 has no escape character, so:
        - values with no single quote: wrap in single quotes
        - values with no double quote: wrap in double quotes
        - values with both: use concat() splitting on single quotes
        """
        if "'" not in value:
            return f"'{value}'"
        if '"' not in value:
            return f'"{value}"'
        # Both quote types present: concat() fragments split on single quotes
        parts = value.split("'")
        fragments = []
        for i, part in enumerate(parts):
            if part:
                fragments.append(f"'{part}'")
            if i < len(parts) - 1:
                fragments.append("\"'\"")
        return f"concat({', '.join(fragments)})"

    def _extract_element_attrs(self, tree_xml: str, element_id: int) -> Optional[dict]:
        """Extract element attributes as a dictionary with positional index.

        Finds the element by id, collects all attributes except id as raw strings,
        then computes the element's positional index among all same-role/same-property elements.

        Args:
            tree_xml: Full accessibility tree XML
            element_id: The id of the element

        Returns:
            Dict with 'role', 'index', optional 'text', and other attributes as raw strings (no 'id'),
            or None if not found
        """
        try:
            root = fromstring(f"<root>{tree_xml}</root>")
            element = root.find(f".//*[@id='{element_id}']")
            if element is None:
                return None

            # Collect all attributes except id as raw strings
            attrs = {key: value for key, value in element.attrib.items() if key != "id"}

            # Also capture text content (including all descendant text nodes) if present
            text = " ".join("".join(element.itertext()).split())
            if text:
                attrs["text"] = text

            # Build XPath from XML attributes (text is matched separately via itertext)
            xpath = f".//{element.tag}"
            for key, value in attrs.items():
                if key != "text":
                    xpath += f"[@{key}={self._xpath_string_literal(value)}]"

            # Find all matching elements, then filter by text content if present
            matches = root.findall(xpath)
            if text:
                matches = [m for m in matches if " ".join("".join(m.itertext()).split()) == text]
            index = 0
            for i, match in enumerate(matches):
                if match.get("id") == str(element_id):
                    index = i
                    break

            result = {"role": element.tag, "index": index}
            result.update(attrs)
            return result

        except Exception as e:
            logger.debug(f"Error extracting element attrs for id {element_id}: {e}")
            return None

    def _resolve_elements(self, elements: list[dict], tree_xml: str) -> Optional[dict[int, int]]:
        """Resolve cached elements to current element IDs in the tree.

        For each cached element, finds the matching element in the current tree
        by role and properties, then uses the positional index to select the correct
        one among duplicates.

        Args:
            elements: List of element attribute dicts (with 'index')
            tree_xml: Current accessibility tree XML

        Returns:
            Dict mapping element list position to current element id, or None on failure
        """
        if not elements:
            # Empty elements list means no elements were used (e.g., planner not yet executed)
            return {}

        try:
            root = fromstring(f"<root>{tree_xml}</root>")
            result = {}

            for list_pos, element in enumerate(elements):
                role = element.get("role")
                idx = element.get("index", 0)

                # Build XPath from XML attributes (text is matched separately via itertext)
                props = {k: v for k, v in element.items() if k not in ("role", "index")}
                text_value = props.pop("text", None)

                xpath = f".//{role}"
                for key, value in props.items():
                    xpath += f"[@{key}={self._xpath_string_literal(value)}]"

                # Find candidates, then filter by text content if present
                matches = root.findall(xpath)
                if text_value:
                    matches = [m for m in matches if " ".join("".join(m.itertext()).split()) == text_value]
                if idx >= len(matches):
                    logger.debug(f"Element index {idx} out of range (found {len(matches)} matches for {role})")
                    return None

                target = matches[idx]
                current_id = target.get("id")
                if current_id is None:
                    logger.debug("Resolved element has no id attribute")
                    return None
                result[list_pos] = int(current_id)

            return result

        except Exception as e:
            logger.debug(f"Error resolving elements: {e}")
            return None

    def _mask_response(self, response_json: str, element_ids: list[int]) -> str:
        """Replace element IDs with <MASKED_N> placeholders in serialized response.

        Masks IDs in:
        - kwargs.message.kwargs.tool_calls[].args (id, from_id, to_id)
        - kwargs.message.kwargs.content[] function_call arguments
        - kwargs.message.kwargs.additional_kwargs.tool_calls[].function.arguments

        Args:
            response_json: Serialized LangChain response JSON
            element_ids: Ordered list of element IDs (position N maps to <MASKED_N>)

        Returns:
            Masked JSON string
        """
        if not element_ids:
            return response_json

        try:
            data = json.loads(response_json)
            id_to_mask = {eid: i for i, eid in enumerate(element_ids)}

            msg_kwargs = data.get("kwargs", {}).get("message", {}).get("kwargs", {})

            # Mask tool_calls args
            for tc in msg_kwargs.get("tool_calls", []):
                args = tc.get("args", {})
                for field in self._ID_FIELDS:
                    if field in args and args[field] in id_to_mask:
                        args[field] = f"<MASKED_{id_to_mask[args[field]]}>"

            # Mask content function_call arguments
            for item in msg_kwargs.get("content", []):
                if isinstance(item, dict) and item.get("type") == "function_call":
                    try:
                        args = json.loads(item.get("arguments", "{}"))
                        changed = False
                        for field in self._ID_FIELDS:
                            if field in args and args[field] in id_to_mask:
                                args[field] = f"<MASKED_{id_to_mask[args[field]]}>"
                                changed = True
                        if changed:
                            item["arguments"] = json.dumps(args)
                    except Exception:
                        pass

            # Mask additional_kwargs tool_calls
            additional = msg_kwargs.get("additional_kwargs", {})
            for tc in additional.get("tool_calls", []):
                func = tc.get("function", {})
                try:
                    args = json.loads(func.get("arguments", "{}"))
                    changed = False
                    for field in self._ID_FIELDS:
                        if field in args and args[field] in id_to_mask:
                            args[field] = f"<MASKED_{id_to_mask[args[field]]}>"
                            changed = True
                    if changed:
                        func["arguments"] = json.dumps(args)
                except Exception:
                    pass

            return json.dumps(data)

        except Exception as e:
            logger.debug(f"Error masking response: {e}")
            return response_json

    def _unmask_response(self, masked_json: str, mask_to_id: dict[int, int]) -> str:
        """Replace <MASKED_N> placeholders with actual element IDs.

        Inverse of _mask_response. Replaces placeholders in the same locations.

        Args:
            masked_json: JSON string with <MASKED_N> placeholders
            mask_to_id: Dict mapping mask index (N) to current element ID

        Returns:
            Unmasked JSON string with actual IDs
        """
        if not mask_to_id:
            return masked_json

        try:
            data = json.loads(masked_json)

            def unmask(value):
                if isinstance(value, str) and value.startswith("<MASKED_") and value.endswith(">"):
                    try:
                        n = int(value[8:-1])
                        return mask_to_id.get(n, value)
                    except ValueError:
                        return value
                return value

            msg_kwargs = data.get("kwargs", {}).get("message", {}).get("kwargs", {})

            # Unmask tool_calls args
            for tc in msg_kwargs.get("tool_calls", []):
                args = tc.get("args", {})
                for field in self._ID_FIELDS:
                    if field in args:
                        args[field] = unmask(args[field])

            # Unmask content function_call arguments
            for item in msg_kwargs.get("content", []):
                if isinstance(item, dict) and item.get("type") == "function_call":
                    try:
                        args = json.loads(item.get("arguments", "{}"))
                        changed = False
                        for field in self._ID_FIELDS:
                            if field in args:
                                new_val = unmask(args[field])
                                if new_val != args[field]:
                                    args[field] = new_val
                                    changed = True
                        if changed:
                            item["arguments"] = json.dumps(args)
                    except Exception:
                        pass

            # Unmask additional_kwargs tool_calls
            additional = msg_kwargs.get("additional_kwargs", {})
            for tc in additional.get("tool_calls", []):
                func = tc.get("function", {})
                try:
                    args = json.loads(func.get("arguments", "{}"))
                    changed = False
                    for field in self._ID_FIELDS:
                        if field in args:
                            new_val = unmask(args[field])
                            if new_val != args[field]:
                                args[field] = new_val
                                changed = True
                    if changed:
                        func["arguments"] = json.dumps(args)
                except Exception:
                    pass

            return json.dumps(data)

        except Exception as e:
            logger.debug(f"Error unmasking response: {e}")
            return masked_json

    def _extract_element_ids(self, return_val: RETURN_VAL_TYPE) -> list[int]:
        """Extract element IDs from tool calls in first-appearance order.

        Args:
            return_val: LLM response containing tool calls

        Returns:
            Ordered list of unique element IDs used in tool calls
        """
        ids: list[int] = []
        seen: set[int] = set()
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
                for field in self._ID_FIELDS:
                    if field in args:
                        eid = args[field]
                        if eid not in seen:
                            ids.append(eid)
                            seen.add(eid)

        except Exception as e:
            logger.debug(f"Error extracting element IDs: {e}")

        return ids

    def _get_cache_path(self, agent_type: str, cache_hash: str, app: str | None = None) -> Path:
        """Get cache directory path for agent type and hash.

        Args:
            agent_type: "plans" or "actions"
            cache_hash: Hash of the goal/step
            app: App namespace override; falls back to self._app

        Returns:
            Path to cache directory
        """
        provider = Model.current.provider.value
        model_name = Model.current.name
        path = self.cache_dir / (app or self._app) / provider / model_name / "elements" / agent_type / cache_hash
        if not path.resolve().is_relative_to(self.cache_dir.resolve()):
            raise ValueError(f"Cache path escapes cache_dir: {path}")
        return path

    def _get_elements_base_dir(self, app: str | None = None) -> Path:
        """Get base directory for elements cache.

        Args:
            app: App namespace override; falls back to self._app

        Returns:
            Path to elements base directory
        """
        provider = Model.current.provider.value
        model_name = Model.current.name
        path = self.cache_dir / (app or self._app) / provider / model_name / "elements"
        if not path.resolve().is_relative_to(self.cache_dir.resolve()):
            raise ValueError(f"Cache path escapes cache_dir: {path}")
        return path

    def _fuzzy_memory_lookup(self, cache_key: str, agent_type: str) -> Optional[tuple[str, str, str]]:
        """Find the best fuzzy-matching entry in the in-memory cache.

        Scans all in-memory entries for the given agent_type and current app and returns the
        (llm_string, cache_hash, app) key of the entry whose stored instruction best
        matches cache_key, provided the similarity is at or above FUZZY_MATCH_THRESHOLD.

        Note: entries loaded from the filesystem have an empty instruction dict and
        are skipped; only entries populated via update() carry the instruction text.

        Args:
            cache_key: The goal (planner) or step (actor) to match against.
            agent_type: "plans" or "actions".

        Returns:
            The matching (llm_string, cache_hash, app) tuple, or None if no match exceeds the threshold.
        """
        key_field = "goal" if agent_type == "plans" else "step"
        best_key: Optional[tuple[str, str, str]] = None
        best_score = 0

        for (llm_str, cache_hash, entry_app), (_, _, entry_agent_type, _, instruction, _) in self._in_memory_cache.items():
            if entry_agent_type != agent_type or entry_app != self._app:
                continue
            cached_key = instruction.get(key_field, "")
            if not cached_key:
                continue
            score = max(fuzz.token_sort_ratio(cache_key, cached_key), fuzz.token_set_ratio(cache_key, cached_key))
            if score > best_score:
                best_score = score
                best_key = (llm_str, cache_hash, entry_app)

        if best_score >= FUZZY_MATCH_THRESHOLD:
            logger.debug(f"Fuzzy cache match (in-memory, {best_score:.0f}%) for {agent_type}: {cache_key[:50]}...")
            return best_key
        return None

    def _fuzzy_lookup_hash(self, cache_key: str, agent_type: str) -> Optional[str]:
        """Find the hash of the best fuzzy-matching cached instruction.

        Scans all instruction.json files in the agent_type directory and returns
        the hash whose stored instruction best matches cache_key, provided the
        similarity is at or above FUZZY_MATCH_THRESHOLD.

        Uses max(token_sort_ratio, token_set_ratio) to handle both word reordering
        and subset/modifier-word variations (e.g. 'click where field' matches
        'click where text field') while rejecting same-length different-target pairs.

        Args:
            cache_key: The goal (planner) or step (actor) to match against.
            agent_type: "plans" or "actions".

        Returns:
            The matching cache hash string, or None if no match exceeds the threshold.
        """
        agent_dir = self._get_elements_base_dir() / agent_type
        if not agent_dir.exists():
            return None

        key_field = "goal" if agent_type == "plans" else "step"
        best_hash: Optional[str] = None
        best_score = 0

        for instr_file in agent_dir.glob("*/instruction.json"):
            try:
                cached_key = json.loads(instr_file.read_text()).get(key_field, "")
                if not cached_key:
                    continue
                score = max(fuzz.token_sort_ratio(cache_key, cached_key), fuzz.token_set_ratio(cache_key, cached_key))
                if score > best_score:
                    best_score = score
                    best_hash = instr_file.parent.name
            except Exception:
                continue

        if best_score >= FUZZY_MATCH_THRESHOLD:
            logger.debug(f"Fuzzy cache match ({best_score:.0f}%) for {agent_type}: {cache_key[:50]}...")
            return best_hash

        logger.debug(
            f"No fuzzy cache match above threshold for {agent_type}: {cache_key[:50]} (best score: {best_score:.0f}%)"
        )
        return None

    @staticmethod
    def _element_dedup_key(elem: dict) -> tuple:
        """Compute deduplication key for an element (all properties except index)."""
        return tuple(sorted((k, v) for k, v in elem.items() if k != "index"))

    def _update_planner_elements(self, goal: str, new_elements: list[dict]):
        """Append elements to planner's in-memory cache entry.

        Deduplicates by (role, sorted properties excluding index).

        Args:
            goal: The goal string for the planner
            new_elements: New element attribute dicts to add
        """
        try:
            goal_hash = xxh3_128_hexdigest(goal)

            # Find and update the planner entry in in-memory cache
            # The planner entry key is (llm_string, goal_hash, app)
            # We need to find it by goal_hash and app since we don't have llm_string here
            for (llm_string, cache_hash, app), (masked_json, elements, agent_type, _, instruction, should_save) in list(
                self._in_memory_cache.items()
            ):
                if cache_hash == goal_hash and agent_type == "plans" and app == self._app:
                    # Deduplicate by (role, sorted properties excluding index)
                    existing_keys = {self._element_dedup_key(elem) for elem in elements}
                    merged = list(elements)
                    for new_elem in new_elements:
                        key = self._element_dedup_key(new_elem)
                        if key not in existing_keys:
                            merged.append(new_elem)
                            existing_keys.add(key)

                    # Update in-memory cache entry
                    self._in_memory_cache[(llm_string, cache_hash, app)] = (
                        masked_json,
                        merged,
                        agent_type,
                        app,
                        instruction,
                        should_save,
                    )
                    logger.debug(f"Updated planner elements: {len(merged)} total elements")
                    break

        except Exception as e:
            logger.debug(f"Error updating planner elements: {e}")

    def _update_usage(self, usage_metadata: dict):
        """Update usage statistics.

        Args:
            usage_metadata: Dict with token usage counts
        """
        self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
        self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
        self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)
