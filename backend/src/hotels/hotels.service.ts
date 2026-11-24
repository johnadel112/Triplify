import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { join } from 'path';
import { MEDIA_FILE_NAME, mediaDir, prepareImages, removeImage, storeImages } from '../common/media';

export const HOTEL_MEDIA_FOLDER = 'hotels';
export const HOTEL_MEDIA_PREFIX = '/api/hotels/media/';
const MAX_HOTEL_IMAGES = 5;
import { Model } from 'mongoose';
import { Principal, UserRole } from '../common/domain';
import { CreateHotelDto, UpdateHotelDto } from './create-hotel.dto';
import { UpdateHotelPoliciesDto } from './hotel-policies.dto';
import { Hotel } from './hotel.schema';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<Hotel>,
  ) {}

  private validateTimeZone(timeZone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new BadRequestException('Invalid hotel time zone');
    }
  }

  private assertModerator(actor: Principal, hotelId: string) {
    if (
      actor.role !== UserRole.HOTEL_MODERATOR ||
      actor.providerType !== 'HOTEL' ||
      !actor.providerId ||
      actor.providerId.toLowerCase() !== hotelId.toLowerCase()
    ) {
      throw new ForbiddenException('You can only manage your assigned hotel');
    }
  }

  // HTL-01: Create a hotel profile (administrator).
  async create(dto: CreateHotelDto, actor: Principal) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can create hotel profiles');
    }
    this.validateTimeZone(dto.timeZone);
    const hotel = await this.hotelModel.create({
      ...dto,
      amenities: dto.amenities ?? [],
      images: dto.images ?? [],
      active: true,
      rating: 0,
      reviewCount: 0,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      cancellationTiers: [],
    });
    return this.findById(String(hotel._id));
  }

  // HTL-02: Public hotel profile (moderator data excluded).
  async findById(hotelId: string) {
    const hotel = await this.hotelModel.findOne({ _id: hotelId, active: true, verified: true })
      .select('-moderatorId -__v').exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  // HTL-01, GEN-08: up to 5 uploaded JPG/PNG photos per hotel (<= 5 MB each), served by URL.
  async addImages(hotelId: string, files: Express.Multer.File[], actor: Principal) {
    this.assertModerator(actor, hotelId);
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) throw new NotFoundException('Hotel not found');
    const prepared = prepareImages(files);
    if (hotel.images.length + prepared.length > MAX_HOTEL_IMAGES) {
      throw new BadRequestException(`A hotel can have at most ${MAX_HOTEL_IMAGES} images`);
    }
    const rollback = await storeImages(HOTEL_MEDIA_FOLDER, prepared);
    try {
      const updated = await this.hotelModel.findOneAndUpdate(
        { _id: hotelId, [`images.${MAX_HOTEL_IMAGES - prepared.length}`]: { $exists: false } },
        { $push: { images: { $each: prepared.map((p) => `${HOTEL_MEDIA_PREFIX}${p.filename}`) } } },
        { new: true },
      ).select('-moderatorId -__v');
      if (!updated) throw new BadRequestException(`A hotel can have at most ${MAX_HOTEL_IMAGES} images`);
      return updated;
    } catch (error) {
      await rollback();
      throw error;
    }
  }

  async removeImage(hotelId: string, imageId: string, actor: Principal) {
    this.assertModerator(actor, hotelId);
    const url = `${HOTEL_MEDIA_PREFIX}${imageId}`;
    const updated = await this.hotelModel.findOneAndUpdate(
      { _id: hotelId, images: url },
      { $pull: { images: url } },
      { new: true },
    ).select('-moderatorId -__v');
    if (!updated) throw new NotFoundException('Image not found on this hotel');
    await removeImage(HOTEL_MEDIA_FOLDER, imageId);
    return updated;
  }

  /** Public: an uploaded photo is served only while it belongs to an active, verified hotel. */
  async imagePath(filename: string) {
    const url = `${HOTEL_MEDIA_PREFIX}${filename}`;
    if (!MEDIA_FILE_NAME.test(filename) || !(await this.hotelModel.exists({ images: url, active: true, verified: true }))) {
      throw new NotFoundException('Image not found');
    }
    return join(mediaDir(HOTEL_MEDIA_FOLDER), filename);
  }

  // HTL-01: Moderator edits a hotel profile.
  async update(hotelId: string, dto: UpdateHotelDto, actor: Principal) {
    this.assertModerator(actor, hotelId);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No hotel fields provided for update');
    }
    if (dto.timeZone !== undefined) this.validateTimeZone(dto.timeZone);

    const hotel = await this.hotelModel.findOneAndUpdate(
      { _id: hotelId },
      { $set: dto },
      { new: true, runValidators: true },
    ).select('-moderatorId -__v').exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  /** HTL-09/10: hotel-local check-in/out times and cancellation refund tiers. */
  async updatePolicies(hotelId: string, dto: UpdateHotelPoliciesDto, actor: Principal) {
    this.assertModerator(actor, hotelId);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide check-in time, check-out time or cancellation tiers');
    }

    const changes: Record<string, unknown> = {};
    if (dto.checkInTime !== undefined) changes.checkInTime = dto.checkInTime;
    if (dto.checkOutTime !== undefined) changes.checkOutTime = dto.checkOutTime;

    if (dto.cancellationTiers !== undefined) {
      const tiers = [...dto.cancellationTiers].sort((a, b) => b.daysBefore - a.daysBefore);
      for (let i = 1; i < tiers.length; i += 1) {
        if (tiers[i].daysBefore === tiers[i - 1].daysBefore) {
          throw new BadRequestException('Cancellation tier daysBefore values must be unique');
        }
        if (tiers[i].refundPercentage > tiers[i - 1].refundPercentage) {
          throw new BadRequestException('Refund percentage cannot increase closer to check-in');
        }
      }
      changes.cancellationTiers = tiers;
    }

    const hotel = await this.hotelModel.findOneAndUpdate(
      { _id: hotelId },
      { $set: changes },
      { new: true, runValidators: true },
    ).select('-moderatorId -__v').exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }
}
