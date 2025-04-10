---
name: Bug Report
about: Report an issue with the Alumnium test automation framework
title: ' Bug: '
labels: needs-triage
assignees: ''
---

#  Bug Report – Alumnium

Thank you for taking the time to file a bug report. Providing detailed and structured information helps us resolve issues faster.

##  Issue Description

**What happened:**  
<!-- Describe what actually happened -->

**What I expected:**  
<!-- What was supposed to happen instead? -->

##  Steps to Reproduce

Include any steps that someone else can follow to reproduce the issue.

1. 
2. 
3. 


```python
# Sample code to trigger the bug
import os
from alumnium import Alumni
from selenium.webdriver import Chrome  # or Playwright

# Your reproduction code here
```

##  Environment Details

**Alumnium Version:**  
<!-- Output of `pip show alumnium` -->

**Automation Framework:**  
<!-- Selenium or Playwright -->

**Framework Version:**  
<!-- e.g., Selenium 4.15.2 or Playwright 1.40.0 -->

**Browser & Version:**  
<!-- e.g., Chrome 120.0.6099.109 -->

**Python Version:**  
<!-- Output of `python --version` -->

**Operating System:**  
<!-- e.g., Ubuntu 22.04, macOS 14.2, Windows 11 -->

##  LLM Configuration

**LLM Provider:**  
<!-- OpenAI, Anthropic, Google (Gemini), Local LLM, etc. -->

**LLM Model Used:**  
<!-- e.g., gpt-4-turbo, claude-3-opus -->

##  Page Details

Provide one of the following:
- The URL of the failing page
- A code snippet or HTML (if reproducible offline)
- Mention if this is confidential and cannot be shared

## ⚠️ Error Logs / Tracebacks

Include the complete error message or logs if available. Use fenced code blocks for clarity.

```
Traceback (most recent call last):
  File "test_case.py", line 10, in <module>
    alumni.click("Submit")
alumnium.exceptions.ElementNotFound: Element 'Submit' not found
```

##  Screenshots / Screen Recordings

<p>Please attach screenshots, screen recordings, or other visual evidence that helps demonstrate the issue.
For large video files, consider uploading to a file sharing service and providing a link</p> 

##  Natural Language Command (Optional)

Include the exact command or query you used that failed.

Example:
"Click the 'Sign up' button and wait for confirmation."

##  Additional Context

Any other relevant information, test data, or previous attempts to fix the issue.

---

Thank you for helping improve Alumnium. We will review your report shortly.
