# Steady

Steady is a private, browser-based net-worth and asset-allocation tracker for personal use. It connects your complete balance sheet to a few financial-responsibility fundamentals: an emergency reserve, costly debt, a consistent savings habit, and a goal-based target allocation.

## What it includes

- A net-worth dashboard covering cash, stocks and funds, deposits and bonds, property, vehicles, mortgages, loans, and other assets or liabilities
- One total per asset group instead of individual holding entry
- A suggested cash, income, and growth mix based on risk posture and emergency-reserve needs
- Editable return assumptions with first-year, five-year, and ten-year growth illustrations
- A working reminder center for monthly balance updates, emergency-fund gaps, costly debt, sample cleanup, and periodic investment-plan reviews
- Emergency reserve, savings rate, automatic contribution, debt, and long-term goal planning
- THB-based values with live USD and AUD display conversion, privacy masking, and responsive mobile navigation
- Automatic monthly net-worth snapshots with a twelve-month trend view
- A dedicated income-progress page with a salary progression graph and company, role, and employment timeline
- Optional Supabase magic-link accounts, secure cross-device sync, and Realtime updates
- Clearly separated sample data and educational disclaimers

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. For a production check:

```bash
npm run build
npm run preview
```

## Enable Supabase sync

The app works in local mode without Supabase. To enable accounts and cross-device sync:

1. Create a Supabase project.
2. Open its SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql). This creates the portfolio and monthly snapshot tables, user-only Row Level Security policies, and the Realtime publication.
3. Copy `.env.example` to `.env.local` and enter the project URL and **publishable** key:

   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
   ```

4. In Supabase Authentication URL Configuration, set the Site URL and allowed redirect URL to your deployed site. Add the local Vite URL while developing.
5. Restart the development server, open the account panel in the sidebar, and request a sign-in link.

Never put a Supabase service-role key in a Vite environment variable. The browser should use only the publishable key; access is restricted by the included Row Level Security policies.

## Data and privacy

Portfolio data is always saved in `localStorage` for offline fallback. When Supabase is configured and the user signs in, the same data and monthly history are also saved to user-protected cloud records. On the first sign-in to an empty cloud account, the current browser portfolio becomes the starting cloud portfolio. On later devices, the existing cloud portfolio is loaded.

All editable money values are stored in THB. USD and AUD are display conversions using the latest available reference rates, with the last successful rates cached for temporary network failures. There is no brokerage connection or automatic market pricing. Steady is an educational planning tool, not individualized investment, tax, or legal advice.
