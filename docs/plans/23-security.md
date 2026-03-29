# Security

## Authentication Security

### Password
- Hashed with **bcrypt** (12 salt rounds)
- Minimum 8 characters enforced
- Never stored or logged in plain text
- Never returned in API responses

### Session
- JWT-based session (NextAuth.js)
- HttpOnly cookies (not accessible via JavaScript)
- Secure flag in production (HTTPS only)
- SameSite=Lax (CSRF protection)
- Session expiry: 7 days
- On block/deactivate: session is invalidated (middleware checks `is_active` on each request)

### Rate Limiting
- Login endpoint: max 5 attempts per 15 minutes per IP
- Registration: max 3 per hour per IP
- Sale submission: configurable (see app settings)
- API endpoints: 100 requests per minute per user

**Implementation:** In-memory rate limiter (or use PostgreSQL-backed counter for persistence across restarts)

## Authorization

### Role-Based Access
| Role | Access |
|---|---|
| `ADMIN` | `/admin/*` routes, all API endpoints |
| `MEMBER` | `/dashboard/*` routes, member-scoped API endpoints |

### Data Isolation
- Members can ONLY see:
  - Their own sales
  - Their own wallet
  - Their own downline (tree below them)
  - Their own notifications
  - Their own profile
- Members can NEVER access other members' data directly
- API endpoints validate `user_id` matches session user for all member operations

### Middleware
```
Request → Auth Check → Role Check → Data Ownership Check → Handler
```

## Input Validation & Sanitization

### All Inputs
- Server-side validation on every endpoint (never trust client)
- Zod schemas for request body validation
- Parameterized queries via Prisma (SQL injection prevention)
- File upload validation (type, size, extension)

### XSS Prevention
- React auto-escapes output by default
- No `dangerouslySetInnerHTML` unless absolutely necessary
- Content Security Policy (CSP) headers
- Announcement content: sanitize markdown (strip script tags)

### File Upload Security
- Bill photos only: JPG, PNG, PDF
- Max 5MB per file
- Files stored outside the public directory
- Served via authenticated API route (not direct file access)
- Filename sanitized (no path traversal)
- File type verified by magic bytes (not just extension)

## API Security

### Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
```

### CORS
- In production: only allow same-origin requests
- No wildcard CORS

## Data Protection

### Sensitive Data
| Data | Storage | Access |
|---|---|---|
| Passwords | bcrypt hash | Never exposed |
| Phone numbers | Plain (needed for display) | Own profile + admin |
| Email | Plain (needed for login) | Own profile + admin |
| Customer names/phones | Plain (needed for sales) | Own sales + admin |
| Wallet balances | Decimal (precise) | Own wallet + admin |

### Environment Variables
- Database credentials, NextAuth secret, admin credentials in `.env`
- `.env` in `.gitignore` (never committed)
- `.env.example` with placeholder values committed
- Coolify manages production env vars securely

## Audit & Logging

- All admin actions logged (see audit trail plan)
- Failed login attempts logged (IP, email, timestamp)
- No sensitive data in logs (no passwords, no tokens)
- Logs stored in application (not sent to external service)

## Database Security

- Application connects with a non-superuser PostgreSQL role
- Principle of least privilege: app user has SELECT, INSERT, UPDATE, DELETE — not DROP, CREATE
- Connection via Docker internal network (not exposed to host)
- Database port NOT exposed to external network in production
