# Fix: settings.json hooks.SessionStart format

## Context
The `.claude/settings.json` file has a malformed hook configuration. `hooks.SessionStart` is an array containing a plain string (`"/karpathy-guidelines"`), but the expected format is an array of hook objects with a `type` field.

## Problem
The current configuration:
```json
{
  "hooks": {
    "SessionStart": [
      "/karpathy-guidelines"
    ]
  }
}
```

This causes the error: `Expected object, but received string` at `hooks.SessionStart.0`.

## Fix
Update `hooks.SessionStart.0` from a string to a hook object. Since `/karpathy-guidelines` is a skill/slash command meant to be invoked as a prompt, use the `prompt` hook type:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "prompt",
        "prompt": "/karpathy-guidelines"
      }
    ]
  }
}
```

## Files to modify
- `/Users/liangchao/claudeCodeSpaces/freelancer_payment_auto/.claude/settings.json`

## Verification
After the fix, run `/doctor` (or equivalent validation) to confirm the settings.json parses without errors.
