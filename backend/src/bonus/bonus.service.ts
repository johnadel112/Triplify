import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import PDFDocument from 'pdfkit';
import { Principal } from '../common/domain';
import { Itinerary } from '../itineraries/itineraries.schema';
import { FlightBooking } from '../flight-bookings/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { Review } from '../hotel-bookings/review.schema';
import { Hotel } from '../hotels/hotel.schema';
import { AirlineProfile, Flight } from '../flights/flights.schema';
import { BlogPost, BlogPostStatus } from '../blog/blog-post.schema';
import { User } from '../users/user.schema';
import { Payment, Refund } from '../payments/payments.schema';
import { PaymentStatus, RefundStatus } from '../payments/payments.constants';
import { BookingAttachment, Favourite } from './bonus.schema';
import { BookingAttachmentDto, FavouriteDto } from './bonus.dto';

@Injectable()
export class BonusService {
  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(Itinerary.name) private itineraries: Model<Itinerary>,
    @InjectModel(FlightBooking.name) private flightBookings: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private hotelBookings: Model<HotelBooking>,
    @InjectModel(Review.name) private reviews: Model<Review>,
    @InjectModel(Hotel.name) private hotels: Model<Hotel>,
    @InjectModel(Flight.name) private flights: Model<Flight>,
    @InjectModel(AirlineProfile.name) private airlines: Model<AirlineProfile>,
    @InjectModel(BlogPost.name) private posts: Model<BlogPost>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Payment.name) private payments: Model<Payment>,
    @InjectModel(Refund.name) private refunds: Model<Refund>,
    @InjectModel(BookingAttachment.name) private attachments: Model<BookingAttachment>,
    @InjectModel(Favourite.name) private favourites: Model<Favourite>,
  ) {}
  async reply(actor: Principal, id: string, text?: string) {
    return this.connection.transaction(async (session) => {
      const hotel = await this.hotels.updateOne(
        { _id: actor.providerId, active: true, verified: true },
        { $inc: { bookingRevision: 1 } },
        { session },
      );
      if (!hotel.modifiedCount) throw new NotFoundException('Assigned hotel not found');
      const result = await this.reviews.findOneAndUpdate(
        { _id: id, hotelId: actor.providerId, hidden: { $ne: true } },
        text === undefined
          ? { $unset: { moderatorReply: 1 } }
          : { $set: { moderatorReply: { text: text.trim(), updatedAt: new Date() } } },
        { new: true, session },
      );
      if (!result) throw new NotFoundException('Review not found');
      return { success: true, reply: result.moderatorReply ?? null };
    });
  }
  private async ownItinerary(actor: Principal, id: string) {
    const itinerary = await this.itineraries.findOne({ _id: id, userId: actor.id });
    if (!itinerary) throw new NotFoundException('Itinerary not found');
    return itinerary;
  }
  async attachBooking(actor: Principal, id: string, dto: BookingAttachmentDto) {
    return this.connection.transaction(async (session) => {
      // Writes serialize with itinerary deletion and booking cancellation.
      const itinerary = await this.itineraries.updateOne(
        { _id: id, userId: actor.id },
        { $inc: { __v: 1 } },
        { session },
      );
      if (!itinerary.modifiedCount) throw new NotFoundException('Itinerary not found');
      const filter = { _id: dto.bookingId, userId: actor.id, status: 'CONFIRMED' };
      const result =
        dto.type === 'FLIGHT'
          ? await this.flightBookings.updateOne(filter, { $inc: { __v: 1 } }, { session })
          : await this.hotelBookings.updateOne(filter, { $inc: { __v: 1 } }, { session });
      if (!result.modifiedCount)
        throw new ConflictException('Only your confirmed bookings can be attached');
      await this.attachments.updateOne(
        { itineraryId: id, type: dto.type, bookingId: dto.bookingId },
        {
          $setOnInsert: {
            itineraryId: id,
            userId: actor.id,
            type: dto.type,
            bookingId: dto.bookingId,
          },
        },
        { upsert: true, session },
      );
      return { success: true };
    });
  }
  async attachedBookings(actor: Principal, id: string) {
    await this.ownItinerary(actor, id);
    const links = await this.attachments
      .find({ itineraryId: id, userId: actor.id })
      .sort({ _id: 1 });
    return {
      items: await Promise.all(
        links.map(async (link) => {
          const filter = { _id: link.bookingId, userId: actor.id };
          const flight =
            link.type === 'FLIGHT' ? await this.flightBookings.findOne(filter).lean() : null;
          const hotel =
            link.type === 'HOTEL' ? await this.hotelBookings.findOne(filter).lean() : null;
          return {
            id: link.id,
            type: link.type,
            bookingId: String(link.bookingId),
            status: flight?.status ?? hotel?.status ?? 'UNAVAILABLE',
            reference: flight?.reference ?? hotel?.reference ?? null,
            description: flight
              ? flight.legs
                  .map((l) => `${l.flightNumber} ${l.departureAirport}-${l.arrivalAirport}`)
                  .join(', ')
              : (hotel?.hotelName ?? null),
            start: flight?.firstDeparture.toISOString() ?? hotel?.checkInDate ?? null,
            end:
              flight?.legs[flight.legs.length - 1]?.arrivalTime.toISOString() ??
              hotel?.checkOutDate ??
              null,
          };
        }),
      ),
    };
  }
  async detachBooking(actor: Principal, id: string, attachmentId: string) {
    await this.ownItinerary(actor, id);
    await this.attachments.deleteOne({ _id: attachmentId, itineraryId: id, userId: actor.id });
    return { success: true };
  }
  async attachItinerary(actor: Principal, postId: string, itineraryId?: string) {
    return this.connection.transaction(async (session) => {
      if (itineraryId) {
        const itinerary = await this.itineraries.updateOne(
          { _id: itineraryId, userId: actor.id, isPublic: true, hidden: { $ne: true } },
          { $inc: { __v: 1 } },
          { session },
        );
        if (!itinerary.modifiedCount)
          throw new NotFoundException('Your public itinerary was not found');
      }
      const post = await this.posts.updateOne(
        { _id: postId, authorId: actor.id },
        itineraryId
          ? { $set: { itineraryId }, $inc: { __v: 1 } }
          : { $unset: { itineraryId: 1 }, $inc: { __v: 1 } },
        { session },
      );
      if (!post.modifiedCount) throw new NotFoundException('Post not found');
      return { success: true };
    });
  }
  private async favouriteTarget(type: string, targetId: string) {
    if (type === 'HOTEL') {
      const item = await this.hotels
        .findOne({ _id: targetId, active: true, verified: true })
        .select('name');
      return item ? { id: targetId, title: item.name } : null;
    }
    if (type === 'FLIGHT') {
      const item = await this.flights
        .findOne({ _id: targetId, status: 'SCHEDULED', departureTimeUtc: { $gt: new Date() } })
        .select('flightNumber airlineId');
      const available =
        item &&
        (await this.airlines.exists({
          $or: [{ _id: item.airlineId }, { moderatorId: item.airlineId }],
          active: true,
          verified: true,
        }));
      return item && available ? { id: targetId, title: item.flightNumber } : null;
    }
    if (type === 'ITINERARY') {
      const item = await this.itineraries
        .findOne({ _id: targetId, isPublic: true, hidden: { $ne: true } })
        .select('title');
      return item ? { id: targetId, title: item.title } : null;
    }
    const item = await this.posts
      .findOne({ _id: targetId, status: BlogPostStatus.PUBLISHED, hidden: { $ne: true } })
      .select('title');
    return item ? { id: targetId, title: item.title } : null;
  }
  async favourite(actor: Principal, dto: FavouriteDto) {
    if (!(await this.favouriteTarget(dto.type, dto.targetId)))
      throw new NotFoundException('Public resource not found');
    await this.favourites.updateOne(
      { userId: actor.id, type: dto.type, targetId: dto.targetId },
      { $setOnInsert: { userId: actor.id, ...dto } },
      { upsert: true },
    );
    return { success: true };
  }
  async listFavourites(actor: Principal, page: number) {
    const filter = { userId: actor.id };
    const [links, total] = await Promise.all([
      this.favourites
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 10)
        .limit(10),
      this.favourites.countDocuments(filter),
    ]);
    return {
      items: await Promise.all(
        links.map(async (link) => ({
          id: link.id,
          type: link.type,
          target: await this.favouriteTarget(link.type, String(link.targetId)),
        })),
      ),
      total,
      page,
      pageCount: Math.ceil(total / 10),
    };
  }
  async unfavourite(actor: Principal, id: string) {
    await this.favourites.deleteOne({ _id: id, userId: actor.id });
    return { success: true };
  }
  async analytics() {
    const [
      users,
      flights,
      hotels,
      posts,
      itineraries,
      flightBookings,
      hotelBookings,
      payments,
      refunds,
      favourites,
    ] = await Promise.all([
      this.users.countDocuments(),
      this.flights.countDocuments(),
      this.hotels.countDocuments(),
      this.posts.countDocuments(),
      this.itineraries.countDocuments(),
      this.flightBookings.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.hotelBookings.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.payments.aggregate<{ _id: string; amount: number; count: number }>([
        { $match: { status: PaymentStatus.SUCCEEDED } },
        { $group: { _id: '$currency', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.refunds.aggregate<{ _id: string; amount: number }>([
        { $match: { status: RefundStatus.SUCCEEDED } },
        { $group: { _id: '$currency', amount: { $sum: '$amount' } } },
      ]),
      this.favourites.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);
    const currencies = [...new Set([...payments, ...refunds].map((row) => row._id))];
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      asOf: new Date().toISOString(),
      period: 'all-time',
      totals: { users, flights, hotels, posts, itineraries },
      flightBookings,
      hotelBookings,
      favourites,
      revenue: currencies.map((currency) => {
        const paid = payments.find((p) => p._id === currency)?.amount ?? 0;
        const refunded = refunds.find((r) => r._id === currency)?.amount ?? 0;
        return {
          currency,
          paid: round(paid),
          refunded: round(refunded),
          net: round(paid - refunded),
        };
      }),
    };
  }
  async exportPdf(actor: Principal, id: string): Promise<Buffer> {
    const itinerary = await this.ownItinerary(actor, id);
    const bookings = await this.attachedBookings(actor, id);
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: itinerary.title, Author: 'Triplify' },
      });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.fontSize(22).text(itinerary.title).moveDown();
      pdf.fontSize(11).text(`${itinerary.startDate} | ${itinerary.countries.join(', ')}`);
      if (itinerary.description) pdf.text(itinerary.description);
      for (const day of itinerary.days) {
        pdf
          .moveDown()
          .fontSize(15)
          .text(`Day ${day.dayNumber} - ${day.date} - ${day.cityName ?? day.cityCode}`);
        pdf.fontSize(11);
        if (day.theme) pdf.text(day.theme);
        for (const activity of day.activities) {
          pdf.text(
            `${activity.time ?? ''} ${activity.title}${activity.location ? ` - ${activity.location}` : ''}`,
          );
          if (activity.description) pdf.text(activity.description);
          if (activity.cost) pdf.text(`Activity cost: ${activity.cost} ${activity.currency ?? ''}`);
        }
        for (const budget of day.budgets)
          pdf.text(`Budget: ${budget.category} ${budget.amount} ${budget.currency}`);
      }
      for (const transport of itinerary.transportCosts)
        pdf
          .moveDown()
          .fontSize(11)
          .text(
            `${transport.transportType}: ${transport.fromCity} to ${transport.toCity} - ${transport.cost} ${transport.currency}`,
          );
      if (bookings.items.length) pdf.moveDown().fontSize(15).text('Attached bookings');
      for (const booking of bookings.items)
        pdf
          .fontSize(11)
          .text(
            `${booking.type}: ${booking.reference ?? 'Unavailable'} - ${booking.status}\n${booking.description ?? ''}\n${booking.start ?? ''} to ${booking.end ?? ''}`,
          )
          .moveDown();
      pdf.end();
    });
  }
}
