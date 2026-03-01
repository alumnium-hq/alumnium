Feature: Gherkin construct compliance

  Scenario: Doc string provides extra assertion context
    Given navigate to "https://www.saucedemo.com"
    When type "standard_user" into the username field
    And type "secret_sauce" into the password field
    And click the login button
    Then the page shows a product catalogue
      """
      Expect at least 6 products, each with a name, price, and Add to cart button.
      """

  Scenario: Data table supplies login credentials
    Given navigate to "https://www.saucedemo.com"
    When fill in the login form with:
      | field    | value         |
      | username | standard_user |
      | password | secret_sauce  |
    And click the login button
    Then the page shows an inventory of products

  Scenario: Asterisk keyword works as a step connector
    Given navigate to "https://www.saucedemo.com"
    * type "standard_user" into the username field
    * type "secret_sauce" into the password field
    * click the login button
    Then the page shows an inventory of products
