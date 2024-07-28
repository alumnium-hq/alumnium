# from behave import *
# from selenium.webdriver.common.by import By
# from selenium.webdriver.common.keys import Keys


# @given('I open "{url}"')
# def step_impl(context, url):
#     context.driver.get(url)


# @when('I create a new task "{title}"')
# def step_impl(context, title):
#     context.driver.find_element(
#         By.CSS_SELECTOR, '[data-testid="text-input"]'
#     ).send_keys(title, Keys.RETURN)


# @when('I check "{title}" task')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, '[data-testid="todo-item"]')
#     task = [x for x in tasks if x.text == title][0]
#     task.find_element(By.CSS_SELECTOR, '[data-testid="todo-item-toggle"]').click()


# @then('I should see "{title}" in the list of tasks')
# def step_impl(context, title):
#     tasks = map(
#         lambda x: x.text,
#         context.driver.find_elements(By.CSS_SELECTOR, '[data-testid="todo-item"]'),
#     )
#     assert title in tasks


# @then('"{title}" task should be uncompleted')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, '[data-testid="todo-item"]')
#     task = [x for x in tasks if x.text == title][0]
#     assert "completed" not in task.get_attribute("class")


# @then('"{title}" task should be completed')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, '[data-testid="todo-item"]')
#     task = [x for x in tasks if x.text == title][0]
#     assert "completed" in task.get_attribute("class")
