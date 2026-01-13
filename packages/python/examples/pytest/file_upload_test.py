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
    al.do(f"upload '{file.name}'")
    al.do("click on 'Upload' button")
    assert al.get("heading") == "File Uploaded!"


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="File upload is not implemented in Appium yet",
)
@mark.xfail(
    "selenium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Hidden file upload inputs are not supported in Selenium",
)
def test_hidden_file_upload(al, file, navigate):
    navigate("hidden_file_upload.html")
    al.do(f"upload '{file.name}'")
    al.do("click 'Upload Files' button")
    assert al.get("success message") == "Files Uploaded Successfully!"
