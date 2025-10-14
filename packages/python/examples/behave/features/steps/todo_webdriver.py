# from behave import *
# from selenium.webdriver.common.action_chains import ActionChains
# from selenium.webdriver.common.by import By
# from selenium.webdriver.common.keys import Keys


# @given('I open "{url}"')
# def step_impl(context, url):
#     context.driver.get(url)


# @when('I create a new task "{title}"')
# def step_impl(context, title):
#     context.driver.find_element(By.CSS_SELECTOR, ".new-todo").send_keys(title, Keys.RETURN)


# @when('I mark the "{title}" task as completed')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     task = [x for x in tasks if title in x.text][0]
#     task.find_element(By.CSS_SELECTOR, ".toggle").click()


# @when('I mark the "{title}" task as uncompleted')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     task = [x for x in tasks if title in x.text][0]
#     task.find_element(By.CSS_SELECTOR, ".toggle").click()


# @when('I delete the "{title}" task')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     task = [x for x in tasks if title in x.text][0]
#     action = ActionChains(context.driver)
#     action.move_to_element(task).perform()
#     task.find_element(By.CSS_SELECTOR, ".destroy").click()


# @when("I mark all tasks as completed")
# def step_impl(context):
#     context.driver.find_element(By.CSS_SELECTOR, "#toggle-all-input").click()


# @when('I show only "{filter}" tasks')
# def step_impl(context, filter):
#     filters = context.driver.find_elements(By.CSS_SELECTOR, "ul.filters > li")
#     filter = [x for x in filters if x.text == filter][0]
#     filter.click()


# @when("I clear completed tasks")
# def step_impl(context):
#     context.driver.find_element(By.CSS_SELECTOR, ".clear-completed").click()


# @then('"{title}" task is shown in the list of tasks')
# def step_impl(context, title):
#     tasks = [
#         x.find_element(By.CSS_SELECTOR, "label").text
#         for x in context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     ]
#     assert title in tasks


# @then('"{title}" task is not shown in the list of tasks')
# def step_impl(context, title):
#     tasks = [
#         x.find_element(By.CSS_SELECTOR, "label").text
#         for x in context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     ]
#     assert title not in tasks


# @then('"{title}" task is not marked as completed')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     task = [x for x in tasks if title in x.text][0]
#     assert "completed" not in task.get_attribute("class")


# @then('"{title}" task is marked as completed')
# def step_impl(context, title):
#     tasks = context.driver.find_elements(By.CSS_SELECTOR, "ul.todo-list > li")
#     task = [x for x in tasks if title in x.text][0]
#     assert "completed" in task.get_attribute("class")


# @then("tasks counter is {count}")
# def step_impl(context, count):
#     assert context.driver.find_element(By.CSS_SELECTOR, ".todo-count > strong").text == count
