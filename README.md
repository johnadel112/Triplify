# 🌍 Triplify — Travel Planning & Booking Platform

**Plan Smarter. Travel Better.**

## About Triplify

Triplify is a web-based travel planning and booking platform designed to make organizing trips easier, faster, and more convenient.

The platform brings together essential travel services in one place, allowing users to explore destinations, search for flights and hotels, manage reservations, and organize their travel plans through a seamless and user-friendly experience.

## Key Features

- ✈️ **Flight Booking:** Search for flights, compare available options, and manage flight reservations.
- 🏨 **Hotel Reservations:** Discover hotels, explore accommodation options, and book stays.
- 🗺️ **Trip Planning:** Create and organize travel itineraries in one place.
- 👤 **User Accounts:** Register, log in, manage personal information, and track bookings.
- 💳 **Booking Management:** View and manage travel reservations.
- 🌐 **Travel Exploration:** Discover destinations and useful travel information.
- 🛡️ **Administration:** Manage users, oversee bookings, and maintain platform operations.
- 🏢 **Provider Management:** Support hotel and airline moderators in managing their assigned services.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | NestJS |
| Database | MongoDB Atlas |
| Language | TypeScript / JavaScript |
| API | RESTful APIs |
| Version Control | Git & GitHub |

## Project Objectives

Triplify aims to:

- Simplify the travel planning and booking process.
- Provide a centralized platform for travel-related services.
- Deliver a secure and personalized user experience.
- Make flight and hotel discovery more accessible.
- Help travelers organize their trips efficiently.
- Support administrators and service providers through dedicated management features.

## Meet the Team

Triplify is developed collaboratively by a team of seven members:

| Team Member | Role |
|---|---|
| **John Adel** | Team Leader |
| **Zeyad Mahmoud** | Team Member |
| **Magdy Mostafa** | Team Member |
| **Yassin Ahmed** | Team Member |
| **Mohamed Essam** | Team Member |
| **Divan Kamel** | Team Member |
| **Youssef Ayman** | Team Member |

## Project Information

**Project Name:** Triplify  
**Project Type:** University Semester Project  
**Category:** Travel & Tourism / Web Application  
**Architecture:** Full-Stack Web Application  
**Development:** Team-Based Software Engineering Project

## Our Vision

Our vision is to make travel planning more accessible, organized, and enjoyable by combining travel discovery, booking, and itinerary management into one integrated digital platform.

## Milestone 2 frontend

John's Next.js App Router frontend is in `frontend/`. It includes the public travel shell, cookie authentication, profile/security settings, role-aware route guards, and administrator account, provider, booking, report and audit interfaces. It reuses the preserved frontend foundation. Backend contracts and known limitations are documented in [the frontend implementation handoff](docs/FRONTEND_MILESTONE_2.md).

```powershell
cd frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:3001`. Run Nest on port 3000 with `FRONTEND_URL=http://localhost:3001` and the backend's local cookie settings. `NEXT_PUBLIC_API_BASE_URL=/api` keeps browser requests same-origin; `BACKEND_API_URL=http://localhost:3000` configures the server proxy. Production requires HTTPS and secure backend cookies.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
# Build backend first; browser tests create a disposable database and start both servers.
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Browser tests require free ports 3000/3001 and installed backend dependencies/build output. They never use the project database. Demonstration screenshots are written to ignored `frontend/test-results/demo-*.png`. Search, booking, itinerary, notification and moderator operations remain assigned to their feature owners; unavailable entry points are explicitly marked.

## Backend setup

The submission backend is in `backend/` and uses NestJS, TypeScript and MongoDB/Mongoose. It includes the integrated REST APIs for accounts and administration, providers, flights and hotels, bookings, Stripe payment/refund workflows, notifications, blog moderation and itineraries.

```powershell
cd backend
npm.cmd ci
Copy-Item .env.example .env
# Supply protected local values; never commit .env.
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
```

Development Swagger is served at `http://localhost:3000/api/docs`, with JSON at `/api/docs-json`. See [backend setup](backend/README.md), [API contract](backend/docs/API.md), [integration workflow](docs/INTEGRATION_WORKFLOW.md), and [finalization status](docs/FINALIZATION_STATUS.md).

MongoDB Atlas is supported through `MONGODB_URI`; booking, payment, provider and account consistency flows require transactions and therefore a replica set. Atlas credentials are not stored in this repository. The frontend integrates through NestJS only.

---

**Triplify — Your Journey, Simplified.**
