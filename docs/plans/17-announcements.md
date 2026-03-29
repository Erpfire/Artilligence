# Announcements System

## Overview
Admin can post announcements visible to all members. No external services — announcements live entirely in the app.

## announcements Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| title | VARCHAR(255) | English title |
| title_hi | VARCHAR(255) | Hindi title |
| content | TEXT | English content (supports basic markdown) |
| content_hi | TEXT | Hindi content |
| is_pinned | BOOLEAN | Pinned announcements stay at top |
| is_active | BOOLEAN | Soft delete / draft |
| created_by | UUID | FK → users.id (admin) |
| published_at | TIMESTAMP | When it became visible |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

## Admin — Create/Manage Announcements (`/admin/announcements`)

### List View
- All announcements (newest first)
- Pinned ones highlighted
- Actions: Edit, Pin/Unpin, Deactivate

### Create/Edit Form
```
Title (English):  [________________________]
Title (Hindi):    [________________________]

Content (English):
[                                          ]
[     Markdown supported text area         ]
[                                          ]

Content (Hindi):
[                                          ]
[     Markdown supported text area         ]
[                                          ]

[ ] Pin this announcement

[Save as Draft]  [Publish]
```

### On Publish
- Announcement becomes visible to all members
- A notification is created for every active member (type: `announcement`)
- Pinned announcements appear at top of member dashboard

## Member — View Announcements

### Dashboard Widget
Top of dashboard shows pinned announcements:

```
┌─────────────────────────────────────────┐
│ 📌 New product added: Exide 200Ah       │
│ Tubular Battery now available.          │
│ Check the catalog for details.          │
│                          28 Mar 2026    │
└─────────────────────────────────────────┘
```

### Announcements Page (`/dashboard/announcements`)
- Full list of all announcements
- Pinned first, then by date
- Content shown in member's preferred language
- Paginated

## Use Cases
- New product launches
- Commission rate changes
- Holiday schedules (office closed, approval delays)
- Important policy updates
- Motivational messages / congratulations for top performers
