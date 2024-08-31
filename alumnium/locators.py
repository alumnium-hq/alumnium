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
        return " | ".join([self.__role_locator, self.__node_locator])

    @property
    def __role_locator(self):
        return f"{self.root}//*[@role='{self.role}']"

    @property
    def __node_locator(self):
        predicate_groups = []
        for predicate_group in self.__predicate_groups:
            if predicate_group:
                predicate_groups.append(f"({' or '.join(predicate_group)})")

        locator = f"{self.root}//*"
        if predicate_groups:
            locator += f"[{' and '.join(predicate_groups)}]"

        return locator

    @property
    def __predicate_groups(self):
        filters = []

        if self.__tag_names:
            filters += [[f'local-name()="{tag}"' for tag in self.__tag_names]]

        name_filters = []
        if self.name:
            name_filters += [
                f"contains(normalize-space(), '{self.name}')",
                f"contains(normalize-space(@aria-label), '{self.name}')",
                f"@id=//label[contains(normalize-space(), '{self.name}')]/@for",
                f"parent::label[contains(normalize-space(), '{self.name}')]",
            ]

        if self.role == "checkbox":
            filters += [["@type='checkbox'"]]
            if self.name:
                name_filters += [
                    f"contains(normalize-space(@name), '{self.name}')",
                    f"contains(normalize-space(@value), '{self.name}')",
                ]
        elif self.role in ["combobox", "textbox"]:
            filters += [["not(@type)", *self.NON_TEXT_TYPE_ATTRIBUTES]]
            if self.name:
                name_filters += [
                    f"contains(normalize-space(@name), '{self.name}')",
                    f"contains(normalize-space(@title), '{self.name}')",
                    f"contains(normalize-space(@value), '{self.name}')",
                    f"contains(normalize-space(@placeholder), '{self.name}')",
                ]

        filters += [name_filters]

        return filters

    @property
    def __tag_names(self):
        if self.role == "button":
            return ["button"]
        elif self.role in ["checkbox", "textbox"]:
            return ["input", "textarea"]
        elif self.role == "combobox":
            return ["textarea"]
        elif self.role == "main":
            return ["main"]
        elif self.role == "link":
            return ["a"]
        elif self.role == "listitem":
            return ["li"]
        elif self.role == "banner":
            return ["header"]


if __name__ == "__main__":
    print(XPath("textbox", "hello"))
