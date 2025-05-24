from os import getcwd
from typing import Any, Optional, Type

from langchain_core.caches import RETURN_VAL_TYPE, BaseCache
from langchain_core.load.dump import dumps
from langchain_core.load.load import loads
from sqlalchemy import Column, String, create_engine, delete, select
from sqlalchemy.engine.base import Engine
from sqlalchemy.orm import Session, declarative_base

from .logutils import get_logger

logger = get_logger(__name__)
Base = declarative_base()


class Schema(Base):
    __tablename__ = "alumnium_cache"
    prompt = Column(String, primary_key=True, nullable=False)
    llm_string = Column(String, primary_key=True, nullable=False)
    response = Column(String, nullable=False)


class Cache(BaseCache):
    def __init__(self, db_path: str = ".alumnium-cache.sqlite", schema: Type[Schema] = Schema):
        self.engine = create_engine(f"sqlite:///{getcwd()}/{db_path}")
        self.schema = schema
        self.schema.metadata.create_all(self.engine)

        self.session = Session(self.engine)

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

    # The following methods are required by LangChain's BaseCache interface.

    def lookup(self, prompt: str, llm_string: str) -> Optional[RETURN_VAL_TYPE]:
        lookup_stmt = (
            select(self.schema.response)
            .where(self.schema.prompt == prompt)
            .where(self.schema.llm_string == llm_string)
        )
        rows = self.session.execute(lookup_stmt).fetchall()
        if rows:
            return [loads(row[0]) for row in rows]

        return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE) -> None:
        # Remove old cache entries
        delete_stmt = (
            delete(self.schema).where(self.schema.prompt == prompt).where(self.schema.llm_string == llm_string)
        )
        self.session.execute(delete_stmt)

        # Add new cache entries
        for _, gen_output in enumerate(return_val):
            entry = self.schema(prompt=prompt, llm_string=llm_string, response=dumps(gen_output))
            self.session.add(entry)

    def clear(self, **kwargs: Any) -> None:
        self.session.execute(delete(self.schema))
