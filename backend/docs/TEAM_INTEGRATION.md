# Team integration contract

The production default implementations in `src/integrations/integrations.module.ts` throw HTTP 503 `INTEGRATION_UNAVAILABLE`. They never synthesize bookings, accept arbitrary provider IDs, or treat outages as an absence of bookings. Tests override Nest tokens only inside the testing module. Replace the defaults with exported real adapters after importing the owning modules. The application uses one MongoDB connection and transactions; Atlas or another replica set is required.

## Zeyad: flight bookings; Youssef: hotel reservations

Implement the `BOOKING_ACCESS` and `BOOKING_READER` interfaces in `src/integrations/contracts.ts`, typically with a composite adapter that calls both owning services. Preserve ownership in your existing collections.

- `hasUpcomingConfirmedBookings(userId, now, transaction)` must check both sources and return true if either contains a CONFIRMED future booking. Hotel: check-out instant > now, including an already-started stay. Flight: any uncompleted segment departure > now. Store/query UTC instants; convert hotel local dates using the property's IANA timezone. Cancellation/completion is nonblocking. Propagate unavailable/failed queries as 503.
- This method and **every new booking confirmation** must serialize through the same user's document in the supplied transaction (a dedicated booking coordination revision increment is suitable). Confirmations must check ACTIVE status and write that coordination revision. Merely reading bookings before deactivating leaves a race. The current account update then conflicts with concurrent booking confirmations. Do not certify this integration until a two-transaction race test passes.
- `findBookings(filters)` returns the normalized `BookingSummary` in source, with reference, type, safe user/provider identity, UTC dates, decimal-string amount and currency, and normalized status. Map source statuses explicitly to PENDING/CONFIRMED/CANCELLED/COMPLETED. Admin endpoint is read-only; no cancellation/payment mutations.
- Filter type/status; inclusive `startDate` lower bound and `endDate` upper bound on the relevant booking start instant. Date-only values mean UTC midnight. For an entire day, frontend must send the final instant of that day or next-day logic according to an agreed adapter update. Sort combined results by startDate descending, then type/reference for ties; aggregate total across both sources **before** taking the requested 10-row page. Do not merge two independently paginated pages. No fake totals.

## Yassin and Magdy: providers

Confirm your team's actual hotel/airline ownership mapping; this code does not assume which developer owns which provider type. Implement `PROVIDER_MANAGEMENT` against the real source collections:

- `verifyProvider(type,id,transaction)` checks existence and type; malformed IDs already fail DTO validation. Serialize against deletion/reassignment as needed. No provider may be hard-deleted while referenced by a moderator.
- `setProviderActive(type,id,active,transaction)` must actually persist state, reject missing providers/invalid transitions, and participate in the same transaction as audit/outbox writes. Returning without persistence violates the contract. External providers on another database need a designed saga/outbox integration before replacing this transaction-bound interface.
- Active searches exclude inactive providers. New booking confirmation must check and serialize against provider state, so a concurrent deactivation cannot accept a new booking. Existing CONFIRMED bookings remain valid. Reactivation restores eligibility subject to other booking rules. Provider suspension and moderator suspension are independent.

## Shared authorization

Global guards protect every controller unless explicitly decorated `@Public()`. `JwtAuthGuard` reads authoritative role/status/provider assignment and a live persistent session. `@Roles(UserRole.ADMIN)` restricts admin controllers. `@CurrentUser()` supplies a server-generated `Principal`; never construct it from client IDs/roles. Only auth/me, logout, refresh and own password-change can operate while `mustChangePassword` is true.

Use `AccessPolicy` from `src/common/policies.ts` in the service/query layer:

```ts
const filter = policy.bookingQuery(actor, isAdministrativeRead);
const booking = await actualBookingModel.findOne({ _id: validatedId, ...filter });
// No record: 404. Never fetch/return an unscoped private record first.
policy.ownerOrAdmin(actor, itinerary.ownerId.toString());
policy.providerScope(actor, 'HOTEL', booking.hotelId.toString());
```

`isAdministrativeRead` is a backend constant on an explicitly admin-guarded route, never a client query field. Private itineraries default to owner-only. Admin booking oversight explicitly opts in. Moderator query scope includes both provider ID and type. Ordinary users cannot change their assignment, role or status. Authenticated DTO bodies reject extra fields.

## Blog/itinerary visibility

Read account status when serving public content, or reliably invalidate caches on state changes. `AccessPolicy.contentVisibility` hides posts/public itineraries for DEACTIVATED authors and returns `Deleted user` for comment/review attribution. SUSPENDED users' content remains visible unless separately moderated. Preserve bookings/financial history. Do not erase content or booking documents in the account service. Actual rendering/query integration remains with those owners.

## Notifications and audit

Account/provider state changes atomically store an audit record plus a `NotificationOutbox` event. Responses explicitly say `PENDING_INTEGRATION`; no delivery is claimed. The future notification developer implements `NotificationDeliveryPort.deliver(AdminNotificationEvent)`, consumes pending events, routes account events to the target account and provider events to affected moderators/parties, and marks DELIVERED only after success. Deduplicate by eventId, retry with backoff, and use an atomic claim/lease for concurrent consumers. Do not run a no-op consumer. Outbox contains no credentials. Audit collections have no public CRUD endpoint; restrict database write permissions operationally. Password resets/moderator creation are audited without passwords.

## Frontend

Use fetch `{credentials:'include'}`. Every POST/PATCH requires `X-Triplify-CSRF: 1` and a browser Origin matching configured exact frontend origins, including registration/login. Cookies are HttpOnly; never put tokens in JS storage. Serialize refresh requests across tabs (BroadcastChannel/Web Locks), because duplicate refresh requests intentionally revoke the session. On 401 `AUTHENTICATION_REQUIRED`, redirect to login and preserve only an allowlisted local route; reject protocol-relative `//`, schemes, backslashes and external URLs. Server `routeHint` is a convenience, not authorization. Show `PASSWORD_CHANGE_REQUIRED` flow before normal app actions. Password change revokes **all** sessions and requires login again.

## Integration acceptance still required

Run tests against actual hotel/flight/provider modules for blocking bookings, new-booking races, provider visibility/eligibility, aggregate pagination and notification delivery. Existing contract tests use isolated test mocks; they do not certify teammate code.

import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

@Injectable()
export class AirportTimezoneService {
  private readonly airports = [
    { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA', timezone: 'America/New_York' },
    { code: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'UK', timezone: 'Europe/London' },
    { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo' },
  ];

  getAirport(code: string) {
    return this.airports.find(a => a.code === code);
  }

  getAllAirports() {
    return this.airports; // FLT-02: Read-only airport list
  }

  toUtc(localTimeStr: string, ianaTimezone: string): Date {
    return DateTime.fromISO(localTimeStr, { zone: ianaTimezone }).toUTC().toJSDate();
  }

  toLocal(utcDate: Date, ianaTimezone: string): string {
    // GEN-06: Display flight times in each airport's local time zone
    return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(ianaTimezone).toISO();
  }
}
import { Injectable, BadRequestNotFound, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flight } from './entities/flight.entity';
import { Cabin } from './entities/cabin.entity';
import { Airline } from './entities/airline.entity';
import { AirportTimezoneService } from './airport-timezone.service';
import { DateTime } from 'luxon';

@Injectable()
export class FlightsService {
  constructor(
    @InjectRepository(Flight) private flightRepo: Repository<Flight>,
    @InjectRepository(Cabin) private cabinRepo: Repository<Cabin>,
    @InjectRepository(Airline) private airlineRepo: Repository<Airline>,
    private tzService: AirportTimezoneService,
  ) {}

  // FLT-01: Airline profile editing for moderator
  async updateAirlineProfile(airlineId: string, moderatorId: string, dto: { name?: string; logo?: string }) {
    const airline = await this.airlineRepo.findOne({ where: { id: airlineId, moderatorId } });
    if (!airline) throw new ForbiddenException('Unauthorized moderator for this airline');
    Object.assign(airline, dto);
    return await this.airlineRepo.save(airline);
  }

  // FLT-03, FLT-04, FLT-30: Create flight with cabins
  async createFlight(airlineId: string, dto: any) {
    const origin = this.tzService.getAirport(dto.originCode);
    const dest = this.tzService.getAirport(dto.destinationCode);
    if (!origin || !dest) throw new BadRequestException('Invalid airport code');
    if (origin.code === dest.code) throw new BadRequestException('Origin and destination cannot be identical');

    const depUtc = this.tzService.toUtc(dto.departureTime, origin.timezone);
    const arrUtc = this.tzService.toUtc(dto.arrivalTime, dest.timezone);
    
    if (DateTime.fromJSDate(depUtc) < DateTime.utc()) {
      throw new BadRequestException('Departure cannot be in the past');
    }
    if (arrUtc <= depUtc) {
      throw new BadRequestException('Arrival must be after departure in UTC');
    }

    const departureDateStr = DateTime.fromJSDate(depUtc).toISODate();
    const duplicate = await this.flightRepo.findOne({
      where: { airlineId, flightNumber: dto.flightNumber, departureDate: departureDateStr },
    });
    if (duplicate) throw new BadRequestException('Duplicate flight number for this airline on this departure date');

    const flight = this.flightRepo.create({
      airlineId,
      flightNumber: dto.flightNumber,
      originCode: origin.code,
      destinationCode: dest.code,
      departureTimeUtc: depUtc,
      arrivalTimeUtc: arrUtc,
      departureDate: departureDateStr,
      status: 'Scheduled', // FLT-30
    });
    await this.flightRepo.save(flight);

    // FLT-04: Cabin categories
    const validCabins = new Set(['Economy', 'Premium Economy', 'Business', 'First']);
    const usedCabins = new Set();
    for (const c of dto.cabins) {
      if (!validCabins.has(c.name) || usedCabins.has(c.name)) throw new BadRequestException('Invalid or duplicate cabin');
      if (c.seatCount <= 0 || !Number.isInteger(c.seatCount)) throw new BadRequestException('Seat count must be positive integer');
      usedCabins.add(c.name);
      
      const cabin = this.cabinRepo.create({ ...c, flightId: flight.id });
      await this.cabinRepo.save(cabin);
    }
    return flight;
  }

  // FLT-05: Edit schedule/prices
  async updateFlight(flightId: string, dto: any) {
    const flight = await this.flightRepo.findOne({ where: { id: flightId }, relations: ['cabins'] });
    if (!flight) throw new BadRequestException('Flight not found');
    if (flight.status === 'Departed' || flight.status === 'Cancelled') {
      throw new BadRequestException('Cannot modify departed or cancelled flight');
    }
    Object.assign(flight, dto);
    return await this.flightRepo.save(flight);
  }

  // FLT-06: Cancel scheduled flight
  async cancelFlight(flightId: string) {
    const flight = await this.flightRepo.findOne({ where: { id: flightId } });
    if (!flight || flight.status !== 'Scheduled') throw new BadRequestException('Flight cannot be cancelled');
    flight.status = 'Cancelled';
    return await this.flightRepo.save(flight);
  }
}
@Injectable()
export class FlightOpsService {
  constructor(
    @InjectRepository(Flight) private flightRepo: Repository<Flight>,
    @InjectRepository(Booking) private bookingRepo: Repository<Booking>,
    @InjectRepository(BaggagePolicy) private baggageRepo: Repository<BaggagePolicy>,
    @InjectRepository(CancellationTier) private tierRepo: Repository<CancellationTier>,
  ) {}

  // FLT-08: Extra bag pricing
  async setExtraBaggage(airlineId: string, flightId: string, price: number, maxWeight: number) {
    const policy = this.baggageRepo.create({ airlineId, flightId, pricePerExtraBag: price, maxWeight });
    return await this.baggageRepo.save(policy);
  }

  // FLT-09: Cancellation tiers
  async setCancellationTiers(airlineId: string, tiers: Array<{ daysBefore: number; refundPercentage: number }>) {
    return await this.tierRepo.save(tiers.map(t => ({ airlineId, ...t })));
  }

  // FLT-11, FLT-12, FLT-15: Search flights
  async searchFlights(params: any) {
    const query = this.flightRepo.createQueryBuilder('f')
      .innerJoinAndSelect('f.cabins', 'c')
      .where('f.originCode = :origin', { origin: params.origin })
      .andWhere('f.destinationCode = :destination', { destination: params.destination })
      .andWhere('c.name = :cabinClass', { cabinClass: params.cabinClass })
      .andWhere('c.seatCount >= :passengers', { passengers: params.passengerCount });

    if (params.minPrice) {
      query.andWhere('c.price >= :minPrice', { minPrice: params.minPrice });
    }

    if (params.sortBy === 'price_asc') query.orderBy('c.price', 'ASC');
    if (params.sortBy === 'departure_asc') query.orderBy('f.departureTimeUtc', 'ASC');

    const outbound = await query.getMany();

    if (params.tripType === 'round_trip') {
      const returnParams = { ...params, origin: params.destination, destination: params.origin };
      const returnFlights = await this.searchFlights(returnParams);
      return { outbound, return: returnFlights.outbound };
    }

    return { outbound };
  }

  // FLT-17: Flight details
  async getFlightDetails(flightId: string) {
    return await this.flightRepo.findOne({ where: { id: flightId }, relations: ['cabins', 'airline'] });
  }

  // FLT-29: Moderator view of bookings per flight
  async getFlightBookings(flightId: string, moderatorAirlineId: string) {
    const flight = await this.flightRepo.findOne({ where: { id: flightId } });
    if (!flight || flight.airlineId !== moderatorAirlineId) throw new ForbiddenException('Access denied');
    return await this.bookingRepo.find({ where: { flightId }, relations: ['passengers'] });
  }
}
@Injectable()
export class BlogInteractionService {
  constructor(
    @InjectRepository(Post) private postRepo: Repository<Post>,
    @InjectRepository(Comment) private commentRepo: Repository<Comment>,
    @InjectRepository(Like) private likeRepo: Repository<Like>,
  ) {}

  // BLG-05: Comment on published post
  async addComment(postId: string, userId: string, content: string) {
    const post = await this.postRepo.findOne({ where: { id: postId, status: 'Published' } });
    if (!post) throw new BadRequestException('Can only comment on published posts');
    if (!content || content.length > 500) throw new BadRequestException('Comment must be non-empty and max 500 chars');

    const comment = this.commentRepo.create({ postId, userId, content });
    return await this.commentRepo.save(comment);
  }

  // BLG-06: Like a post once (toggle mechanism)
  async toggleLike(postId: string, userId: string) {
    const existing = await this.likeRepo.findOne({ where: { postId, userId } });
    if (existing) {
      await this.likeRepo.remove(existing);
    } else {
      await this.likeRepo.save(this.likeRepo.create({ postId, userId }));
    }
    const likeCount = await this.likeRepo.count({ where: { postId } });
    return { liked: !existing, likeCount };
  }

  // BLG-07: Edit/Delete own comments
  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId, userId } });
    if (!comment) throw new NotFoundException('Comment not found');
    comment.content = content;
    return await this.commentRepo.save(comment);
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId, userId } });
    if (!comment) throw new NotFoundException('Comment not found');
    return await this.commentRepo.remove(comment);
  }
}

