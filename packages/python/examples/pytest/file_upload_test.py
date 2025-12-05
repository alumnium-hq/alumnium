from os import getenv
from tempfile import NamedTemporaryFile

from pytest import fixture, mark


@fixture
def file():
    with NamedTemporaryFile(mode="w+", suffix=".txt") as file:
        yield file


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="File upload is not implemented in Appium yet",
)
def test_file_upload(al, file, navigate):
    navigate("https://the-internet.herokuapp.com/upload")
    al.do(f"type '{file.name}' to 'Choose File' button")
    al.do("click on 'Upload' button")
    assert al.get("heading") == "File Uploaded!"
