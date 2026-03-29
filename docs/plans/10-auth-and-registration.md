# Authentication & Registration

## Auth Method
Email + Password using NextAuth.js v5 (credentials provider)

## Registration Flow

### 1. Referral Link
- Every member has a unique referral code (e.g., `ABC123`)
- Registration URL: `/join/<referral_code>`
- Without a valid referral code, registration is **not possible**
- The referral code identifies the **sponsor**

### 2. Registration Page (`/join/<referral_code>`)

Shows: "You've been referred by **[Sponsor Name]**"

Form:
| Field | Validation |
|---|---|
| Full Name | Required, 2-100 chars |
| Email | Required, valid email, unique |
| Phone | Required, valid Indian phone number |
| Password | Required, min 8 chars |
| Confirm Password | Must match |
| Preferred Language | English / Hindi |

### 3. On Submit
1. Validate referral code → get sponsor
2. Create user account (password hashed with bcrypt)
3. Set sponsor_id = sponsor's user ID
4. Run BFS spillover to find placement position under sponsor's subtree
5. Set parent_id and position
6. Generate unique referral code for new member
7. Create wallet (all zeros)
8. Redirect to login page with success message

### 4. Post-Registration
- Member logs in with email + password
- Redirected to member dashboard

## Login (`/login`)

Form:
| Field | Validation |
|---|---|
| Email | Required |
| Password | Required |

Behaviors:
- On success: redirect to `/dashboard` (member) or `/admin` (admin)
- On failure: "Invalid email or password"
- Blocked account: "Your account has been deactivated. Contact admin."

## Session Management
- NextAuth.js session with JWT strategy
- Session contains: user ID, role, name, email
- Session expiry: 7 days (configurable)
- Protected routes via middleware

## Route Protection

| Route Pattern | Access |
|---|---|
| `/admin/*` | Admin only |
| `/dashboard/*` | Authenticated members only |
| `/join/*` | Public (registration) |
| `/login` | Public |
| `/` | Public (landing page / redirect) |

## Admin Account
- Created via database seed script
- Single admin, credentials set via environment variables
- Admin account has no referral code, no sponsor, no parent, no wallet
- Cannot register as admin through the UI

## Password Reset
- Phase 1 (MVP): Admin resets password for member manually
- Phase 2 (future): Email-based password reset flow

## Security
- Passwords hashed with bcrypt (12 rounds)
- CSRF protection via NextAuth
- Rate limiting on login endpoint (prevent brute force)
- Referral codes are random alphanumeric (not sequential)
