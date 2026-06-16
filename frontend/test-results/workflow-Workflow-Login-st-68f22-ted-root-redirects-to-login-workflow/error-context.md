# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> Workflow: Login >> step 1 — unauthenticated root redirects to /login
- Location: e2e\workflow.spec.ts:55:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Tearing down "context" exceeded the test timeout of 30000ms.
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - heading "Accounting Tool" [level=1] [ref=e6]
    - paragraph [ref=e7]: Sign in to your account
  - generic [ref=e8]:
    - generic [ref=e9]:
      - generic [ref=e10]: Email
      - textbox "Email" [ref=e11]:
        - /placeholder: you@example.com
    - generic [ref=e12]:
      - generic [ref=e13]: Password
      - textbox "Password" [ref=e14]:
        - /placeholder: ••••••••
    - button "Sign in" [ref=e15]
  - paragraph [ref=e16]: Contact your administrator if you need access.
```