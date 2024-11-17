Feature: To Do application

  Background:
    # Also passes on react, preact, and jquery!
    Given I open "https://todomvc.com/examples/vue/dist/"

  Scenario: Create a task
    When I create a new task "Buy milk"
    Then "Buy milk" task is shown in the list of tasks
    And "Buy milk" task is not marked as completed
    And tasks counter is 1

  Scenario: Complete a task
    When I create a new task "Buy milk"
    And I mark the "Buy milk" task as completed
    Then "Buy milk" task is marked as completed
    And tasks counter is 0

  Scenario: Uncomplete a task
    When I create a new task "Buy milk"
    And I mark the "Buy milk" task as completed
    And I mark the "Buy milk" task as uncompleted
    Then "Buy milk" task is not marked as completed
    And tasks counter is 1

  Scenario: Complete all tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I mark all tasks as completed
    Then "Buy milk" task is marked as completed
    And "Buy bread" task is marked as completed
    And tasks counter is 0

  Scenario: Delete a task
    When I create a new task "Buy milk"
    And I delete the "Buy milk" task
    Then "Buy milk" task is not shown in the list of tasks

  Scenario: Show active tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I mark the "Buy milk" task as completed
    And I show only "Active" tasks
    Then "Buy bread" task is shown in the list of tasks
    But "Buy milk" task is not shown in the list of tasks

  Scenario: Show completed tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I mark the "Buy milk" task as completed
    And I show only "Completed" tasks
    Then "Buy milk" task is shown in the list of tasks
    But "Buy bread" task is not shown in the list of tasks

  Scenario: Clear completed tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I mark the "Buy milk" task as completed
    And I clear completed tasks
    Then "Buy bread" task is shown in the list of tasks
    But "Buy milk" task is not shown in the list of tasks
