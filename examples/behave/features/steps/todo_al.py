from behave import *


@given('I open "{url}"')
def step_impl(context, url):
    context.driver.get(url)


@when('I create a new task "{title}"')
def step_impl(context, title):
    context.al.do(f"I create a new task '{title}'")


@when('I complete the "{title}" task')
def step_impl(context, title):
    context.al.do(f'I mark the "{title}" task as completed')


@when('I uncomplete the "{title}" task')
def step_impl(context, title):
    context.al.do(f'I mark the "{title}" task as uncompleted')


@when('I delete the "{title}" task')
def step_impl(context, title):
    context.al.do(f'I hover the "{title}" task')
    context.al.do(f'I delete the "{title}" task')


@when("I complete all tasks")
def step_impl(context):
    # Avoid attempting to complete tasks one by one.
    context.al.do("I mark all tasks completed using 'Toggle All' button")


@when('I show only "{filter}" tasks')
def step_impl(context, filter):
    context.al.do(f'I show only "{filter}" tasks')


@when("I clear completed tasks")
def step_impl(context):
    context.al.do("I clear completed tasks")


@then('I should see "{title}" in the list of tasks')
def step_impl(context, title):
    context.al.check(f'I should see "{title}" in the list of tasks')


@then('I should not see "{title}" in the list of tasks')
def step_impl(context, title):
    context.al.check(f'I should not see "{title}" in the list of tasks')


@then('"{title}" task should be uncompleted')
def step_impl(context, title):
    context.al.check(f'"{title}" task is not marked as completed')


@then('"{title}" task should be completed')
def step_impl(context, title):
    context.al.check(f'"{title}" task is marked as completed')


@then("tasks counter should be {count}")
def step_impl(context, count):
    context.al.check(f'tasks counter should be {count}")')
