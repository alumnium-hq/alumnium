from behave import *


@given('I open "{url}"')
def step_impl(context, url):
    context.al.act(f'I open "{url}"')


@when('I create a new task "{title}"')
def step_impl(context, title):
    context.al.act(f"I create a new task '{title}'")


@when('I complete the "{title}" task')
def step_impl(context, title):
    context.al.act(f'I complete the "{title}" task')


@when('I uncomplete the "{title}" task')
def step_impl(context, title):
    context.al.act(f'I uncomplete the "{title}" task')


@when('I delete the "{title}" task')
def step_impl(context, title):
    context.al.act(f'I hover the "{title}" task')
    # The button is "×" UTF symbol that cannot be easily located via XPath.
    context.al.act(f'I delete the "{title}" task by clicking the first button inside the task')


@when("I complete all tasks")
def step_impl(context):
    # If we omit "by clicking ..." - Al fail because ARIA name of the checkbox is "❯ Toggle All Input".
    # Alternatively, we can tell Al to "I check each task one by one".
    context.al.act("I complete all tasks by clicking a checkbox with 'Toggle All' text")


@when('I show only "{filter}" tasks')
def step_impl(context, filter):
    context.al.act(f'I show only "{filter}" tasks')


@when("I clear completed tasks")
def step_impl(context):
    context.al.act("I clear completed tasks")


@then('I should see "{title}" in the list of tasks')
def step_impl(context, title):
    context.al.assess(f'I should see "{title}" in the list of tasks')


@then('I should not see "{title}" in the list of tasks')
def step_impl(context, title):
    context.al.assess(f'I should not see "{title}" in the list of tasks')


@then('"{title}" task should be uncompleted')
def step_impl(context, title):
    context.al.assess(f'"{title}" task is uncompleted')


@then('"{title}" task should be completed')
def step_impl(context, title):
    context.al.assess(f'"{title}" task is completed')


@then("tasks counter should be {count}")
def step_impl(context, count):
    context.al.assess(f'tasks counter should be {count}")')
