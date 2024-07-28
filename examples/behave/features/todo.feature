Feature: To Do application
  TODO: Order of tests matter!
  "I complete all tasks" step somehow affects LLM reasoning about "I complete the "{title}" task" step.
  This causes the latter to start failing, so "Complete all tasks" scenario should be the last one.
  As if LLM has some kind of memory and it's not reset between scenarios.

  Background:
    Given I open "https://todomvc.com/examples/vue/dist/"

  Scenario: Create a task
    When I create a new task "Buy milk"
    Then I should see "Buy milk" in the list of tasks
    And "Buy milk" task should be uncompleted
    And tasks counter should be 1

  Scenario: Complete a task
    When I create a new task "Buy milk"
    And I complete the "Buy milk" task
    Then "Buy milk" task should be completed
    And tasks counter should be 0

  Scenario: Uncomplete a task
    When I create a new task "Buy milk"
    And I complete the "Buy milk" task
    And I uncomplete the "Buy milk" task
    Then "Buy milk" task should be uncompleted
    And tasks counter should be 1

  Scenario: Delete a task
    When I create a new task "Buy milk"
    And I delete the "Buy milk" task
    Then I should not see "Buy milk" in the list of tasks
    And tasks counter should be 0

  Scenario: Show active tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I complete the "Buy milk" task
    And I show only "Active" tasks
    Then I should see "Buy bread" in the list of tasks
    But I should not see "Buy milk" in the list of tasks

  Scenario: Show completed tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I complete the "Buy milk" task
    And I show only "Completed" tasks
    Then I should see "Buy milk" in the list of tasks
    But I should not see "Buy bread" in the list of tasks

  Scenario: Clear completed tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I complete the "Buy milk" task
    And I clear completed tasks
    Then I should see "Buy bread" in the list of tasks
    But I should not see "Buy milk" in the list of tasks

  Scenario: Complete all tasks
    When I create a new task "Buy milk"
    And I create a new task "Buy bread"
    And I complete all tasks
    Then "Buy milk" task should be completed
    And "Buy bread" task should be completed
    And tasks counter should be 0
