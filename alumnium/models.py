from enum import Enum
from os import environ


class Model(Enum):
    AZURE_OPENAI = "gpt-4o-mini"  # 2024-07-18
    ANTHROPIC = "claude-3-haiku-20240307"
    AWS_ANTHROPIC = "anthropic.claude-3-haiku-20240307-v1:0"
    AWS_META = "us.meta.llama3-2-90b-instruct-v1:0"
    DEEPSEEK = "deepseek-chat"
    GOOGLE = "gemini-2.0-flash-001"
    OLLAMA = "mistral-small3.1"
    OPENAI = "gpt-4o-mini-2024-07-18"

    @classmethod
    def load(cls):
       model_fullname = environ.get("ALUMNIUM_MODEL","openai").upper()
       if model_fullname in Model.__members__:
           model = Model[model_fullname]
           return model
       else: 
           custom_model = cls.provider(model_fullname)  
           return custom_model 
       
    @classmethod
    def provider(cls,model_value:str) ->Enum:
        index = model_value.find("/")
        parent_model = model_value[:index]
        return Model[parent_model]
    
    @classmethod
    def name(cls) ->str:
        model_fullname = environ.get("ALUMNIUM_MODEL","openai").upper()
        if model_fullname in Model.__members__:
           return Model[model_fullname].value
        else:
            index = model_fullname.find("/")
            return model_fullname[index+1:]        
