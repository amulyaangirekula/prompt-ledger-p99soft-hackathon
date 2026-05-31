# PromptLedger

**AI-powered personal & group expense tracker with streaming chat and MCP tools.**

PromptLedger lets you manage expenses, split group costs, track budgets, and get AI-driven financial insights — all through natural language.

---

## Features

### AI Workspace
- Streaming chat powered by **Google Gemini** via OpenAI-compatible API
- 28 MCP tools callable through natural language
- Voice input (Web Speech API), file/image attachments
- Tool call visibility — see exactly which tools the AI invoked
- Suggestion cards and quick action prompts

### Expense Management
- Add, edit, delete personal expenses with category, subcategory, date and notes
- Paginated expense table with search and filters
- Monthly summary and category breakdown

### Groups & Splitting
- Create groups (trip, family, team, personal)
- Invite members via shareable codes
- Add shared expenses split equally among members
- Approval workflow — expenses require member votes before finalising
- Group balances and debt simplification (minimum transfers to settle)
- Record real settlements (UPI, cash, etc.)

### Reports & Analytics
- Period selector: W-4, Month, Quarter, Year
- Daily spending trend line chart (current vs previous period)
- Spending by category donut chart
- Amount by category progress bars + weekly bar chart
- Top transactions list
- AI-generated insights

### Budgets
- Create personal, category, or group budgets
- Monthly/weekly/yearly/custom periods
- Live actual spend tracking
- Budget alerts and over-budget indicators

### Settings
- Monthly salary and spending limit configuration
- Per-user settings stored in localStorage (keyed by email)
- Sidebar budget alert widget — turns red when spending exceeds limit

### AI Tools Reference
- Full reference page listing all 28 available AI tools
- Grouped by category with descriptions and example prompts
- Accessible from the sidebar

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (React 19 + TanStack Router + TanStack Query) |
| Build | Vite 7 |
| Runtime | Cloudflare Workers (via `@cloudflare/vite-plugin`) |
| Database | Supabase (PostgreSQL + Auth + RPCs) |
| AI | Google Gemini via OpenAI-compatible streaming API |
| UI | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Icons | Lucide React |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Notifications | Sonner |
| Markdown | react-markdown + remark-gfm |

---

## Project Structure

```
src/
├── components/
│   ├── layout/
│   │   └── AppShell.tsx        # Sidebar, header, budget alert widget
│   ├── chat/
│   │   └── ChatPanel.tsx       # Streaming AI chat with tools popover
│   └── ui/                     # shadcn/ui components
├── lib/
│   ├── api-key.ts              # localStorage auth helpers
│   ├── budget-settings.ts      # Per-user budget settings (localStorage)
│   ├── db/
│   │   ├── dispatcher.server.ts    # Tool router — maps names to handlers
│   │   ├── supabase.server.ts      # Supabase client factory + JWT refresh
│   │   ├── jwt.server.ts           # JWT subject extraction
│   │   ├── settlements.server.ts   # Balance accumulation + debt simplification
│   │   └── tools/
│   │       ├── auth.server.ts          # register, login
│   │       ├── expenses.server.ts      # personal expense CRUD + reports
│   │       ├── groups.server.ts        # group lifecycle
│   │       ├── group-expenses.server.ts # shared expenses + approvals
│   │       ├── settlement-tools.server.ts # balances + settlements
│   │       └── budgets.server.ts       # budget CRUD
│   └── mcp/
│       └── mcp.functions.ts    # TanStack Start server functions (API bridge)
└── routes/
    ├── __root.tsx              # Root layout
    ├── index.tsx               # Dashboard
    ├── expenses.tsx            # Expenses page
    ├── groups.tsx              # Groups page
    ├── approvals.tsx           # Pending approvals
    ├── reports.tsx             # Reports & analytics
    ├── chat.tsx                # AI Workspace (full page)
    ├── ai-tools.tsx            # AI Tools reference
    ├── budgets.tsx             # Budgets page
    ├── settings.tsx            # Settings page
    ├── login.tsx               # Login
    ├── register.tsx            # Register
    └── api/
        └── chat.ts             # SSE streaming endpoint for AI chat
```

---

## AI Tools (28 total)

### Expense Management (4)
| Tool | Description |
|---|---|
| `add_expense` | Add a personal expense |
| `list_expenses` | List expenses by date range |
| `edit_expense` | Edit an existing expense |
| `delete_expense` | Delete an expense |

### Reports & Analytics (2)
| Tool | Description |
|---|---|
| `summarize` | Spending totals by category |
| `monthly_report` | Full monthly report with trends |

### Groups & Splitting (12)
| Tool | Description |
|---|---|
| `create_group` | Create a new group |
| `list_my_groups` | List all your groups |
| `create_group_invite` | Generate an invite code |
| `redeem_group_invite` | Join a group via invite |
| `list_group_members` | List group members |
| `add_group_expense` | Add a shared expense |
| `list_group_transactions` | List group transactions |
| `group_summary` | Group spending breakdown |
| `group_balances` | Net balance per member |
| `simplify_group_debts` | Minimum transfers to settle |
| `record_settlement` | Record a payment |
| `list_group_settlements` | List settlement history |

### Approvals (5)
| Tool | Description |
|---|---|
| `list_my_pending_approvals` | Expenses awaiting your approval |
| `approve_group_expense` | Approve a pending expense |
| `reject_group_expense` | Reject a pending expense |
| `list_pending_group_expenses` | Pending expenses in a group |
| `delete_group_expense` | Delete a pending expense |

### Budget Settings (3)
| Tool | Description |
|---|---|
| `list_budgets` | List budgets with live spend |
| `upsert_budget` | Create or update a budget |
| `delete_budget` | Delete a budget |

### Auth (2)
| Tool | Description |
|---|---|
| `register_new_user` | Create a new account |
| `login_get_api_key` | Sign in and get API key |

---

## Environment Variables

Create a `.env` file in the project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # optional
GEMINI_API_KEY=your-gemini-api-key
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Authentication Flow

1. User registers or logs in → Supabase issues a JWT + refresh token
2. An API key is generated and stored in Supabase (`api_keys` table) with the refresh token
3. The API key is saved to `localStorage` on the client
4. Every tool call sends the API key to the server
5. Server validates the key → exchanges refresh token for a fresh JWT → executes the tool
6. Rotated refresh token is persisted back to the DB

Sessions expire when the Supabase refresh token expires. The app detects this and shows a re-login banner.

---

## License

MIT
