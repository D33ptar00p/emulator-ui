# Security policy

## Reporting a vulnerability

**Please don't report security issues in public GitHub issues, discussions or pull requests.**

Report them privately, either way:

1. **GitHub private vulnerability reporting (preferred).** Go to the repository's
   [Security tab](https://github.com/D33ptar00p/emulator-ui/security) and choose **Report a vulnerability**.
2. **Email** deeptaroop2015@gmail.com with the subject `[emulator-ui security]`.

Please include:
- the version or commit you tested;
- how the console was run (`make up` container or `make dev` on the host);
- steps to reproduce and the impact you observed;
- a proof of concept, if you have one.

This is a personal project maintained in spare time. I aim to acknowledge reports within **7 days** and to agree on
a fix and disclosure timeline with you. Please give me reasonable time to fix an issue before disclosing it publicly.
Credit is given in the release notes unless you'd rather stay anonymous.

## Supported versions

Only the latest release on the `main` branch gets security fixes.

## Scope

Emulator UI is a **local-only developer tool**. It holds the credentials of a locally running emulator, so it's
designed to be reachable only from your own machine:

- It's published on `127.0.0.1` only.
- It rejects requests whose `Host` header isn't localhost, which blocks DNS rebinding.
- Every state-changing request must carry an `X-Emulator-UI: 1` header (a CSRF guard); no CORS is granted.
- It refuses to call any non-local endpoint, so it never talks to real AWS.
- Emulator endpoints come only from server configuration, never from the browser.
- Downloaded S3 objects are served with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`.

**In scope:** anything that defeats those controls, for example:
- a web page you visit that can read or change emulator data through the console;
- a way to make the console call a non-local endpoint;
- reading files outside the console's static directory;
- script execution in the console's origin.

**Out of scope:**
- Deployments that deliberately expose the console beyond localhost, e.g. publishing port 8080 on `0.0.0.0` or
  putting it behind a public proxy. Don't do this; the console has no authentication.
- Vulnerabilities in AWS Emulator itself. Report those to AWS through the
  [aws/aws-emulator](https://github.com/aws/aws-emulator) repository's security tab.
- Vulnerabilities in third-party dependencies, unless Emulator UI uses them in a way that makes them exploitable.
  Report the rest upstream.
- Behaviour of the emulator that differs from real AWS, such as IAM not being evaluated like AWS does. The emulator
  isn't meant for testing security.
