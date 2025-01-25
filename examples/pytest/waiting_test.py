def test_waiting_for_loading_content(al, navigate):
    navigate("https://the-internet.herokuapp.com/dynamic_content")
    al.check("3 image avatars are displayed")
    # al.do("click Enable button")
    # It takes few seconds to enable the text field
    # al.check("text field is enabled")

def test_waiting_for_requests_and_form_updates(al, navigate):
    navigate("https://the-internet.herokuapp.com/forgot_password")
    al.do("type test@example.com in the email field")
    al.do("click Retrieve password button")
    al.check("should see Internal Server Error")
