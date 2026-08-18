---
base-url: https://seleniumbase.io/apps/calculator
---

# Calculator: Addition

1. Generate two random numbers from 1 to 10 and their sum:

```sh
jq -n \
    --argjson a "$((RANDOM % 10 + 1))" \
    --argjson b "$((RANDOM % 10 + 1))" \
    '{num1: $a, num2: $b, sum: ($a + $b)}'
```

2. Perform the same sum in the application.
3. Check that the results match.
