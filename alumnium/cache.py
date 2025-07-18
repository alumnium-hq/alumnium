from os import getcwd
from typing import Any, Optional
import json
import time
import xxhash

from langchain_core.caches import RETURN_VAL_TYPE, BaseCache
from langchain_core.load.dump import dumps
from langchain_core.load.load import loads
from sqlalchemy import (
    Column,
    String,
    Integer,
    create_engine,
    delete,
    select,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import Session, declarative_base, relationship

from .models import Model
from .logutils import get_logger

logger = get_logger(__name__)
Base = declarative_base()


class ModelConfig(Base):
    __tablename__ = "model_configs"
    id = Column(Integer, primary_key=True)
    model_name = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    # Add a unique constraint on the combination of fields that make a config unique
    __table_args__ = (UniqueConstraint("model_name", "provider", name="uix_model_config"),)


class CacheEntry(Base):
    __tablename__ = "cache_entries"
    id = Column(Integer, primary_key=True)
    model_config_id = Column(Integer, ForeignKey("model_configs.id"))
    hashed_request = Column(String, nullable=False)
    response = Column(String, nullable=False)
    created_at = Column(Integer, nullable=False)  # timestamp

    model_config = relationship("ModelConfig")

    __table_args__ = (UniqueConstraint("model_config_id", "hashed_request", name="uix_cache_entry"),)


class Cache(BaseCache):
    def __init__(self, db_path: str = ".alumnium-cache.sqlite"):
        self.engine = create_engine(f"sqlite:///{getcwd()}/{db_path}")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    def _get_or_create_model_config(self, llm_string: str) -> ModelConfig:
        model_config = (
            self.session.query(ModelConfig)
            .filter_by(
                model_name=Model.current.name,
                provider=Model.current.provider.value,
            )
            .first()
        )
        if not model_config:
            model_config = ModelConfig(
                model_name=Model.current.name,
                provider=Model.current.provider.value,
            )
            self.session.add(model_config)
            self.session.flush()
        return model_config

    def _extract_messages(self, prompt: str) -> tuple[str, str]:
        messages = json.loads(prompt)
        system_message = ""
        human_message = ""
        for msg in messages:
            if msg["kwargs"]["type"] == "system":
                system_message = msg["kwargs"]["content"]
            elif msg["kwargs"]["type"] == "human":
                content = msg["kwargs"]["content"]
                if isinstance(content, list):
                    for content_item in content:
                        if "text" in content_item:
                            human_message += content_item["text"]
                        if "image_url" in content_item:
                            human_message += content_item["image_url"]["url"]
                elif isinstance(content, dict):
                    if "text" in content:
                        human_message += content["text"]
                    if "image_url" in content:
                        human_message += content["image_url"]["url"]
                else:
                    human_message += content
        return system_message, human_message

    def _hash_request(self, system_message: str, human_message: str) -> str:
        # Combine messages and hash them
        combined = f"{system_message}|{human_message}"
        return xxhash.xxh3_128_hexdigest(combined)

    def save(self) -> None:
        try:
            self.session.commit()
        except Exception as e:
            logger.error(f"Error saving to database: {e}")

    def discard(self) -> None:
        try:
            self.session.rollback()
        except Exception as e:
            logger.error(f"Error discarding changes: {e}")

    def lookup(self, prompt: str, llm_string: str) -> Optional[RETURN_VAL_TYPE]:
        system_message, human_message = self._extract_messages(prompt)
        model_config = self._get_or_create_model_config(llm_string)
        hashed_request = self._hash_request(system_message, human_message)

        lookup_stmt = (
            select(CacheEntry.response)
            .join(CacheEntry.model_config)
            .where(CacheEntry.hashed_request == hashed_request)
            .where(ModelConfig.id == model_config.id)
        )

        rows = self.session.execute(lookup_stmt).fetchall()
        if rows:
            logger.debug(f"Cache hit for message: {human_message[:100]}...")
            responses = []
            for row in rows:
                response = loads(row[0])
                self.usage["input_tokens"] += response.message.usage_metadata.get("input_tokens", 0)
                self.usage["output_tokens"] += response.message.usage_metadata.get("output_tokens", 0)
                self.usage["total_tokens"] += response.message.usage_metadata.get("total_tokens", 0)
                responses.append(response)

            return responses

        return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE) -> None:
        system_message, human_message = self._extract_messages(prompt)
        model_config = self._get_or_create_model_config(llm_string)
        hashed_request = self._hash_request(system_message, human_message)

        # Remove old cache entries
        delete_stmt = (
            delete(CacheEntry)
            .where(CacheEntry.hashed_request == hashed_request)
            .where(CacheEntry.model_config_id == model_config.id)
        )
        self.session.execute(delete_stmt)

        # Add new cache entry
        entry = CacheEntry(
            model_config_id=model_config.id,
            hashed_request=hashed_request,
            response=dumps(return_val[0]),
            created_at=int(time.time()),
        )
        self.session.add(entry)

    def clear(self, **kwargs: Any) -> None:
        self.session.execute(delete(CacheEntry))
        self.session.execute(delete(ModelConfig))
