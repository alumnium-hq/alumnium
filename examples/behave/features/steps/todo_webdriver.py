from behave import *
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys


@given('I open "{url}"')
def step_impl(context, url):
    context.driver.get(url)


@when('I create a new task "{title}"')
def step_impl(context, title):
    context.driver.find_element(By.CSS_SELECTOR, ".new-todo").send_keys(title, Keys.RETURN)


@when('I complete the "{title}" task')
def step_impl(context, title):
    tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    task = [x for x in tasks if title in x.text][0]
    task.find_element(By.CSS_SELECTOR, ".toggle").click()


@when('I uncomplete the "{title}" task')
def step_impl(context, title):
    tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    task = [x for x in tasks if title in x.text][0]
    task.find_element(By.CSS_SELECTOR, ".toggle").click()


@when('I delete the "{title}" task')
def step_impl(context, title):
    tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    task = [x for x in tasks if title in x.text][0]
    action = ActionChains(context.driver)
    action.move_to_element(task).perform()
    task.find_element(By.CSS_SELECTOR, ".destroy").click()


@when("I complete all tasks")
def step_impl(context):
    context.driver.find_element(By.CSS_SELECTOR, "#toggle-all-input").click()


@when('I show only "{filter}" tasks')
def step_impl(context, filter):
    filters = context.driver.find_elements(By.CSS_SELECTOR, "ul.filters > li")
    filter = [x for x in filters if x.text == filter][0]
    filter.click()


@when("I clear completed tasks")
def step_impl(context):
    context.driver.find_element(By.CSS_SELECTOR, ".clear-completed").click()


@then('I should see "{title}" in the list of tasks')
def step_impl(context, title):
    tasks = [
        x.find_element(By.CSS_SELECTOR, "label").text
        for x in context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    ]
    assert title in tasks


@then('I should not see "{title}" in the list of tasks')
def step_impl(context, title):
    tasks = [
        x.find_element(By.CSS_SELECTOR, "label").text
        for x in context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    ]
    assert title not in tasks


@then('"{title}" task should be uncompleted')
def step_impl(context, title):
    tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    task = [x for x in tasks if title in x.text][0]
    assert "completed" not in task.get_attribute("class")


@then('"{title}" task should be completed')
def step_impl(context, title):
    tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
    task = [x for x in tasks if title in x.text][0]
    assert "completed" in task.get_attribute("class")


@then("tasks counter should be {count}")
def step_impl(context, count):
    assert context.driver.find_element(By.CSS_SELECTOR, ".todo-count > strong").text == count


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
