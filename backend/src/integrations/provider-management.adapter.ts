import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ProviderType } from '../common/domain';
import { AirlineProfile } from '../flights/flights.schema';
import { Hotel } from '../hotels/hotel.schema';
import { ProviderManagementPort } from './contracts';

@Injectable()
export class ProviderManagementAdapter implements ProviderManagementPort {
  constructor(
    @InjectModel(Hotel.name) private readonly hotels: Model<Hotel>,
    @InjectModel(AirlineProfile.name) private readonly airlines: Model<AirlineProfile>,
  ) {}

  async verifyProvider(type: ProviderType, id: string, session: ClientSession) {
    const query = type === 'HOTEL'
      ? this.hotels.exists({ _id: new Types.ObjectId(id) })
      : this.airlines.exists({ _id: new Types.ObjectId(id) });
    return !!(await query.session(session));
  }

  async setProviderVerified(type: ProviderType, id: string, verified: boolean, session: ClientSession) {
    const filter = { _id: new Types.ObjectId(id), verified: { $ne: verified } };
    const update = { $set: { verified } };
    const options = { session, runValidators: true };
    const result = type === 'HOTEL'
      ? await this.hotels.updateOne(filter, update, options)
      : await this.airlines.updateOne(filter, update, options);
    if (!result.matchedCount) {
      const exists = await this.verifyProvider(type, id, session);
      if (!exists) throw new NotFoundException(`${type.toLowerCase()} provider not found`);
      throw new ConflictException(`Provider is already ${verified ? 'verified' : 'unverified'}`);
    }
  }

  async setProviderActive(type: ProviderType, id: string, active: boolean, session: ClientSession) {
    const filter = { _id: new Types.ObjectId(id), active: { $ne: active }, ...(active ? { verified: true } : {}) };
    const update = { $set: { active } };
    const options = { session, runValidators: true };
    const result = type === 'HOTEL'
      ? await this.hotels.updateOne(filter, update, options)
      : await this.airlines.updateOne(filter, update, options);
    if (!result.matchedCount) {
      const provider = type === 'HOTEL'
        ? await this.hotels.findById(id).session(session).lean()
        : await this.airlines.findById(id).session(session).lean();
      if (!provider) throw new NotFoundException(`${type.toLowerCase()} provider not found`);
      if (active && !provider.verified) throw new ConflictException('Provider must be verified before activation');
      throw new ConflictException(`Provider is already ${active ? 'active' : 'inactive'}`);
    }
  }
}
