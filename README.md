# BarangayLink

**A Web-Based Document Request and Facility Reservation System**

**Live site:** https://barangay-link-chi.vercel.app

BarangayLink lets residents of a barangay request documents and reserve facilities online and track their status, and lets barangay staff review, approve and manage everything from an admin panel.

**Developer:** Mark Angelo M. Ong

> Login credentials for testing (admin and sample resident) are provided to the instructor separately.

# Features

## Residents
- Register, log in and log out, with hashed passwords
- Verify their account by uploading a valid ID in the **Profile** tab
- Request documents (Barangay Clearance, Certificate of Residency, Certificate of Indigency), with a purpose, and track the status
- Cancel pending requests and reservations
- Reserve facilities on an interactive monthly calendar that shows booked and pending slots, then pick the time with hour, minute and AM/PM selectors
- Receive in-app notifications that link to the related page
- A home page that shows what needs attention (a document ready for pickup, a reservation today or tomorrow), recent requests and reservations, and the barangay hall's hours and contact details
- See the barangay's announcements and upcoming events on the home page and on the login page

## Administrators
- Review submitted IDs: approve, or reject with a note the resident can see
- Edit, terminate (with a reason) and reactivate resident accounts
- Process document requests: Pending, Processing, Ready for Pickup, Completed, or Denied with a note
- Approve or reject reservations. Approving a booking **automatically rejects overlapping pending requests** and notifies those residents
- Manage document types and facilities (activate or deactivate, so past records are kept)
Post and manage **announcements and events**: add, edit, activate or deactivate, and pin one announcement to the top
- Dashboard with live counts, a requests-per-document-type chart, a facility-usage chart and a work queue
- Search, filter and sort on the main lists

# Rules enforced on the server
- Only verified accounts can request documents or reserve facilities
- A reservation cannot be in the past, and cannot overlap an approved booking for the same facility and date (`new.start < existing.end AND new.end > existing.start`)
- Role-based access: residents cannot open admin pages or admin data
- A terminated account is logged out immediately
- Only one announcement can be pinned at a time, and an inactive announcement cannot stay pinned

# Modern / edge features
- **File upload with validation:** JPG, PNG or PDF, up to 4 MB, stored in a private bucket
- **Notifications:** unread count in the navigation bar, click to open, hover to mark as read
- **Charts and data visualization:** admin dashboard (Chart.js)
- **Web Storage and dark mode:** the chosen theme is remembered in `localStorage`, and by default follows the device's theme
- **Shared error handling:** lost connection, slow server, session ended and server errors are handled on every page
- **Responsive design:** the pages and navigation bars adapt to phones, tablets and laptops

# Tech stack
| Layer        | Technology |
|---|---|
| Frontend     | HTML5, CSS3, JavaScript ES6+, Bootstrap 5, Chart.js |
| Backend      | Node.js with Express |
| Database     | PostgreSQL (Supabase) |
| File storage | Supabase Storage (private bucket) |
| Hosting      | Vercel |

Main packages: `express`, `pg`, `bcryptjs`, `cookie-session`, `multer`, `@supabase/supabase-js`, `dotenv`.

# Database
Nine tables, created by `database/schema.sql`:

| Table | Purpose |
|---|---|
| `users`             | Login accounts (resident or admin), with active status and termination reason |
| `residents`         | Resident details and ID verification status |
| `document_types`    | Documents residents can request |
| `document_requests` | Requests and their status |
| `facilities`        | Facilities residents can reserve |
| `reservations`      | Reservations and their status |
| `notifications`     | In-app notifications, with a link to the related page |
| `announcements`     | Notices shown on the login and home pages (one can be pinned) |
| `events`            | Upcoming events shown next to the announcements |

The diagrams are in `docs/` (`erd-final.png` and `use-case-final.png` are the current versions; the Week 1 files show the original design).

# Project structure
```
server.js          Express app, login, registration, page routes
db.js              Database connection
storage.js         File upload and download (Supabase Storage)
createAdmin.js     Creates an admin account
routes/            API routes for residents, admins and the public board
views/             Pages that need a login (resident and admin)
public/            Login page, shared scripts (navigation bars, error handling, announcements board) and site-config.js
database/          schema.sql (tables and starting data)
docs/              Diagrams and wireframes
```

# Run it locally
1. Install [Node.js](https://nodejs.org) and clone this repository.
2. Install the packages:
   ```bash
   npm install
   ```
3. Create a free [Supabase](https://supabase.com) project. In the **SQL Editor**, run the contents of `database/schema.sql`. In **Storage**, create a **private** bucket named `uploads`.
4. Copy `.env.example` to `.env` and fill in the values:
   ```
   PORT=3000
   DATABASE_URL=   (Supabase "Transaction pooler" connection string)
   SUPABASE_URL=   (Supabase project URL)
   SUPABASE_SECRET_KEY=   (Supabase secret key, server only)
   SESSION_SECRET=   (a long random text)
   ```
5. Create an admin account:
   ```bash
   node createAdmin.js admin@example.com "YourStrongPassword"
   ```
6. Start the site:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

# Deployment
The app is deployed on Vercel from the `main` branch. The four variables above (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`) are set in the Vercel project settings. Every push to `main` deploys automatically.

# Security
- Passwords are hashed with bcrypt
- Sessions use a signed, HTTP-only cookie
- Role checks run on the server for every admin and resident route
- Uploaded IDs are stored in a private bucket and only an admin can open them
- Secrets are kept in environment variables and never committed

# Notes
- The free Supabase plan pauses a project after a week without activity. If the site shows errors, open the Supabase dashboard and click **Restore**.
- The free hosting plans can respond slowly for the first request after a period of no use.
- Not included yet: a self-service "forgot password" flow.