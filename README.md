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

## Milestone 1 backend

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

MongoDB Atlas is supported through `MONGODB_URI`; booking, payment, provider and account consistency flows require transactions and therefore a replica set. Atlas credentials are not stored in this repository. The Next.js draft is isolated from the Milestone 1 backend branch and remains Milestone 2 work.

---

**Triplify — Your Journey, Simplified.**
