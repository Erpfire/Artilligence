# Tech Stack

## Frontend + Backend (Monolith)
| Layer | Technology |
|---|---|
| Framework | **Next.js 14** (App Router) |
| Language | **TypeScript** |
| Styling | **Tailwind CSS** |
| UI Components | **shadcn/ui** |
| Forms | **React Hook Form + Zod** (validation) |
| State | **React Server Components** + minimal client state |
| Tree Visualization | **react-d3-tree** or **react-organizational-chart** |
| Internationalization | **next-intl** (English + Hindi, member-facing only) |
| Reports/Export | **jspdf** (PDF) + **exceljs** (Excel) |
| Charts | **recharts** (dashboard analytics) |

## Backend / Data
| Layer | Technology |
|---|---|
| ORM | **Prisma** |
| Database | **PostgreSQL 16** |
| Auth | **NextAuth.js v5** (credentials provider — email + password) |
| Password Hashing | **bcrypt** |
| API | **Next.js Route Handlers** (REST) |

## Infrastructure
| Layer | Technology |
|---|---|
| Containerization | **Docker** + **docker-compose** |
| Deployment | **Coolify** |
| Reverse Proxy | Handled by Coolify (Traefik) |

## Project Structure (Planned)
```
artilligence/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, register pages
│   │   ├── (member)/           # Member dashboard (i18n)
│   │   │   ├── dashboard/
│   │   │   ├── sales/
│   │   │   ├── wallet/
│   │   │   ├── tree/
│   │   │   └── referral/
│   │   ├── (admin)/            # Admin panel (English only)
│   │   │   ├── dashboard/
│   │   │   ├── members/
│   │   │   ├── products/
│   │   │   ├── sales/
│   │   │   ├── wallets/
│   │   │   ├── commissions/
│   │   │   └── reports/
│   │   └── api/                # Route handlers
│   ├── components/
│   │   ├── ui/                 # shadcn components
│   │   ├── admin/
│   │   ├── member/
│   │   └── shared/
│   ├── lib/
│   │   ├── db.ts               # Prisma client
│   │   ├── auth.ts             # NextAuth config
│   │   ├── commission.ts       # Commission calculation engine
│   │   ├── tree.ts             # Tree placement (BFS spillover)
│   │   └── utils.ts
│   ├── i18n/
│   │   ├── en.json
│   │   └── hi.json
│   └── types/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docs/
│   └── plans/
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## Why This Stack?
- **Next.js**: Single deployable unit (no separate frontend/backend), great for Coolify
- **Prisma**: Type-safe queries, excellent for relational data like tree structures
- **PostgreSQL**: Recursive CTEs for tree traversal, reliable for financial data
- **shadcn/ui**: Professional-looking dashboard components out of the box
- **Docker**: Required for Coolify deployment
