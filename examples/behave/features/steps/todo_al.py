from behave import *


@given('I open "{url}"')
def step_impl(context, url):
    context.driver.get(url)


@when('I create a new task "{title}"')
def step_impl(context, title):
    context.al.do(f"create a new task '{title}'")


@when('I mark the "{title}" task as completed')
def step_impl(context, title):
    context.al.do(f'mark the "{title}" task as completed')


@when('I mark the "{title}" task as uncompleted')
def step_impl(context, title):
    context.al.do(f'mark the "{title}" task as uncompleted')


@when('I delete the "{title}" task')
def step_impl(context, title):
    context.al.do(f'hover the "{title}" task')
    context.al.do(f'delete the "{title}" task')


@when("I mark all tasks as completed")
def step_impl(context):
    # Avoid attempting to complete tasks one by one.
    context.al.do("mark all tasks as completed using 'Toggle All' button")


@when('I show only "{filter}" tasks')
def step_impl(context, filter):
    context.al.do(f'I show only "{filter}" tasks')


@when("I clear completed tasks")
def step_impl(context):
    context.al.do("clear completed tasks")


@then('"{title}" task is shown in the list of tasks')
def step_impl(context, title):
    context.al.check(f'"{title}" task is shown in the list of tasks')


@then('"{title}" task is not shown in the list of tasks')
def step_impl(context, title):
    context.al.check(f'"{title}" task is not shown in the list of tasks')


@then('"{title}" task is not marked as completed')
def step_impl(context, title):
    context.al.check(f'"{title}" task is not marked as completed')


@then('"{title}" task is marked as completed')
def step_impl(context, title):
    context.al.check(f'"{title}" task is marked as completed')


@then("tasks counter is {count}")
def step_impl(context, count):
    context.al.check(f'tasks counter is {count} items left")')
