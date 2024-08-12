class XPath:
    NON_TEXT_TYPE_ATTRIBUTES = [
        "@type != 'file'",
        "@type != 'radio'",
        "@type != 'checkbox'",
        "@type != 'submit'",
        "@type != 'reset'",
        "@type != 'image'",
        "@type != 'button'",
        "@type != 'hidden'",
        "@type != 'range'",
    ]

    def __init__(self, role: str, name: str, root: str = "."):
        self.role = role
        self.name = "".join(filter(str.isascii, name or "")).strip()
        self.root = root

    def __str__(self):
        tag_locator = f"{self.root}//{self.__tag_name}"
        if self.__attributes:
            tag_locator += f"[{' and '.join(self.__attributes)}]"

        role_locator = f"{self.root}//*[@role='{self.role}']"

        return f"{tag_locator} | {role_locator}"

    @property
    def __tag_name(self):
        if self.role == "button":
            return "button"
        elif self.role in ["checkbox", "textbox"]:
            return "input"
        elif self.role == "combobox":
            return "textarea"
        elif self.role == "main":
            return "main"
        elif self.role == "link":
            return "a"
        elif self.role == "listitem":
            return "li"
        elif self.role == "banner":
            return "header"
        else:
            return "*"

    @property
    def __attributes(self):
        attributes = []
        if self.role == "checkbox":
            attributes += ["@type='checkbox'"]
            if self.name:
                attributes += [
                    f"(contains(normalize-space(@name), '{self.name}') or"
                    f" contains(normalize-space(@value), '{self.name}') or"
                    f" contains(normalize-space(), '{self.name}') or"
                    f" @id= //label[contains(normalize-space(), '{self.name}')]/@for or"
                    f" parent::label[contains(normalize-space(), '{self.name}')])"
                ]
        elif self.role in ["combobox", "textbox"]:
            attributes += [f"(not(@type) or {' or '.join(self.NON_TEXT_TYPE_ATTRIBUTES)})"]
            if self.name:
                attributes += [
                    f"(contains(normalize-space(@name), '{self.name}') or"
                    f" contains(normalize-space(@title), '{self.name}') or"
                    f" contains(normalize-space(@value), '{self.name}') or"
                    f" contains(normalize-space(@placeholder), '{self.name}') or"
                    f" contains(normalize-space(), '{self.name}') or"
                    f" @id=//label[contains(normalize-space(), '{self.name}')]/@for or"
                    f" parent::label[contains(normalize-space(), '{self.name}')])"
                ]
        else:
            if self.name:
                attributes += [
                    f"(contains(normalize-space(), '{self.name}') or"
                    f" @id=//label[contains(normalize-space(), '{self.name}')]/@for or"
                    f" parent::label[contains(normalize-space(), '{self.name}')])"
                ]

        return attributes
