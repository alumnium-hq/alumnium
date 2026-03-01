Feature: SauceDemo login

  Scenario: Standard user can log in and see inventory
    Given navigate to "https://www.saucedemo.com"
    When type "standard_user" into the username field
    And type "secret_sauce" into the password field
    And click the login button
    Then the page shows an inventory of products

  Scenario Outline: Multiple user types can log in and see inventory
    Given navigate to "https://www.saucedemo.com"
    When type "<username>" into the username field
    And type "secret_sauce" into the password field
    And click the login button
    Then the page shows an inventory of products

    Examples: valid users
      | username      |
      | standard_user |
      | problem_user  |
