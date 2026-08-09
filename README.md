# Steady

Steady is a private, browser-based net-worth and asset-allocation tracker for personal use. It connects your complete balance sheet to a few financial-responsibility fundamentals: an emergency reserve, costly debt, a consistent savings habit, and a goal-based target allocation.

## What it includes

- A net-worth dashboard covering cash, stocks and funds, deposits and bonds, property, vehicles, mortgages, loans, and other assets or liabilities
- One total per asset group instead of individual holding entry
- A suggested cash, income, and growth mix based on risk posture and emergency-reserve needs
- Editable return assumptions with first-year, five-year, and ten-year growth illustrations
- A working reminder center for monthly balance updates, emergency-fund gaps, costly debt, sample cleanup, and periodic investment-plan reviews
- Emergency reserve, savings rate, automatic contribution, debt, and long-term goal planning
- Currency display including Thai baht (THB), privacy masking, responsive mobile navigation, and local browser persistence
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

## Data and privacy

Portfolio data is saved in `localStorage` on the current browser only. There is no account, server, brokerage connection, live pricing, or automatic backup. Export the holdings CSV before clearing browser storage or changing devices.

Changing the display currency updates labels only; it does not convert holding values. Steady is an educational planning tool, not individualized investment, tax, or legal advice.
