# Riviera — Hotel Management System

Riviera is a live hotel management system in daily production use. It handles:

- **Front Desk Operations**: Guest check-ins/check-outs, room assignments, occupancy management
- **Reservations**: Booking management, stay scheduling, room allocation
- **Guest Management**: Guest profiles, contact information, stay details stored in extra_details
- **Payments**: Multiple payment modes (cash, account, BTC late-payment mode), revenue tracking, ledger management
- **Restaurant/POS Module**: Integrated point-of-sale system with invoicing and menu management
- **Night Audit**: Automated end-of-day reconciliation and reporting
- **Financial Reporting**: Revenue reports, account checks, and comprehensive financial audits

The system runs entirely in the browser against a Supabase backend with PostgREST API, no separate server. The entire application lives in a single `app/index.html` file (~28,000 lines) with hotel and restaurant code deliberately isolated via separate namespacing and routing.

Key design principles: no hard deletes, stay state stored in JSON fields, Karachi timezone as single source of truth for dates, and zero staging environment (all changes go straight to production).
