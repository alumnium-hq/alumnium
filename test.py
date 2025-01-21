import anthropic
import base64

client = anthropic.Anthropic()

for i in [1, 2]:
    with open(f"/Users/p0deje/Development/alumnium/{i}.png", "rb") as image_file:
        encoded_image = base64.b64encode(image_file.read()).decode("utf-8")
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1000,
            temperature=0,
            system="You are a helpful assistant who analyzes a screenshot of a webpage, its accessibility (ARIA) tree given as XML, and extracts requested information from it. If the information is a list, separate the items with <|sep|>. Reply with requested information and nothing else.",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Requested information: square titles ordered from left to right"},
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": encoded_image},
                        },
                    ],
                }
            ],
            # tools=[
            #     {
            #         "name": "extract_information",
            #         "description": "Extracts information.",
            #         "input_schema": {
            #             "type": "object",
            #             "properties": {
            #                 "value": {
            #                     "type": "array",
            #                     "description": "Extracted information.",
            #                     "items": {"description": "Data.", "type": "string"},
            #                 }
            #             },
            #             "required": ["value"],
            #         },
            #     }
            # ],
        )
        print(message)
