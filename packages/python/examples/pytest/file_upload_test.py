from os import getenv
from tempfile import NamedTemporaryFile

from pytest import fixture, mark

from alumnium import Model, Provider

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")


@fixture
def file():
    with NamedTemporaryFile(mode="w+", suffix=".txt") as file:
        yield file


@fixture
def file2():
    with NamedTemporaryFile(mode="w+", suffix=".txt") as file:
        yield file


@mark.xfail("appium" in driver_type, reason="File upload is not implemented in Appium yet")
def test_file_upload(al, file, navigate):
    navigate("https://the-internet.herokuapp.com/upload")
    al.do(f"upload '{file.name}'")
    al.do("click on 'Upload' button")
    assert al.get("heading") == "File Uploaded!"


@mark.xfail("appium" in driver_type, reason="File upload is not implemented in Appium yet")
@mark.xfail(Model.current.provider == Provider.AWS_META, reason="Prefers to click on the upload button manually")
def test_multiple_file_upload(al, file, file2, navigate):
    navigate("multiple_file_upload.html")
    al.do(f"upload files '{file.name}', '{file2.name}'")
    al.do("click 'Upload Files' button")
    assert al.get("success message") == "✓ Upload Successful!"
    assert al.get("uploaded files names") == [
        file.name.split("/")[-1],
        file2.name.split("/")[-1],
    ]


@mark.xfail("appium" in driver_type, reason="File upload is not implemented in Appium yet")
@mark.xfail(driver_type == "selenium", reason="Hidden file upload inputs are not supported in Selenium")
@mark.xfail(Model.current.provider == Provider.AWS_META, reason="Prefers to click on the upload button manually")
def test_hidden_file_upload(al, file, navigate):
    navigate("hidden_file_upload.html")
    al.do(f"upload '{file.name}' to 'Choose Files' button")
    al.do("click 'Upload Files' button")
    assert al.get("success message") == "Files Uploaded Successfully!"
