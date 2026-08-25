# Security Policy

## Supported Versions

The following table lists which versions of this project are currently supported with security updates:

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| Previous | :white_check_mark: |
| < Latest | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please follow these steps:

1. **Do not open a public issue.**  
   Instead, use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

2. **Include as much detail as possible:**
   - A description of the vulnerability.
   - Steps to reproduce.
   - Any relevant logs or screenshots.

3. **Response Time:**  
   We aim to respond to security reports within 5 business days. You will receive updates as we investigate and address the issue.

4. **Disclosure:**  
   Once the vulnerability is resolved, we will coordinate with you to disclose the issue responsibly.

## In Scope

- Authentication and authorization bypasses
- Data exposure, IDORs, and access control flaws
- Credential or secret exposure (password hashes, TOTP secrets, JWT keys)
- Token/session handling and CSRF issues
- Configuration or deployment mistakes that expose data

## Out of Scope

- Social engineering
- Denial of service without a clear impact path
- Physical attacks
- Third-party service vulnerabilities outside this repository

## Security Updates

We recommend always using the latest version of this project to ensure you have the most recent security updates.

---

Thank you for helping keep this project and its users safe!
