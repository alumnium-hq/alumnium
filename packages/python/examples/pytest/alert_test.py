def test_alert_accept(al, navigate):
    navigate("alert.html")
    al.do("click the Trigger Alert button")
    al.check("an alert dialog is shown")
    al.do("accept the alert")


def test_confirm_dismiss(al, navigate):
    navigate("alert.html")
    al.do("click the Trigger Confirm button")
    al.check("a confirm dialog is shown")
    al.do("dismiss the alert")
    al.check("the result text says Dismissed")
