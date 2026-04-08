# Guest Feedback Mailer

Simple internal web app for sending personalized post-stay thank-you / feedback emails.

## What it does

- Capture guest first name, last name, and email
- Edit a reusable message template
- Personalize the subject and body with guest data
- Preview the outgoing email before sending
- Save a send log locally
- Attempt real email delivery through Gmail SMTP using app credentials stored in `.env` or host environment variables

## Template variables

- `{{firstName}}`
- `{{lastName}}`
- `{{fullName}}`
- `{{email}}`

## Run locally

```bash
cd /Users/revmax/.openclaw/workspace/guest-feedback-webapp
node server.js
```

Then open:

<http://127.0.0.1:3040>

## Notes

- This is intended as a private hotel operations tool, not a public website.
- Delivery depends on the host machine being able to send mail through its configured local mail stack.
- Every send attempt is logged under `guest-feedback-webapp/data/email-logs/`.
