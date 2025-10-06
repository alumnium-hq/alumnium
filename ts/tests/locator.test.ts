/// <reference path="./globals.d.ts" />

import assert from 'assert';

describe('Locator Tests', () => {
  it('locator', async () => {
    await driver.get('https://bonigarcia.dev/selenium-webdriver-java/web-form.html');

    const textInput = await al.find('text input');
    assert.notStrictEqual(textInput, null);
    await textInput.sendKeys('Hello Alumnium!');

    const textarea = await al.find('textarea');
    assert.notStrictEqual(textarea, null);
    await textarea.sendKeys('Testing the LocatorAgent');

    const submitButton = await al.find('submit button');
    assert.notStrictEqual(submitButton, null);
    await submitButton.click();
  });
});
