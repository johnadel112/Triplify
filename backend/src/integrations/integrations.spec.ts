import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientSession, Model, Types } from 'mongoose';
import { AirlineProfile } from '../flights/flights.schema';
import { Hotel } from '../hotels/hotel.schema';
import { ProviderManagementAdapter } from './provider-management.adapter';

describe('Provider management adapter (ACC-15)', () => {
  const id = new Types.ObjectId().toString();
  const session = {} as ClientSession;
  const query = <T>(value: T) => ({
    session: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
      then: (resolve: (result: T) => void) => resolve(value),
    }),
  });
  let hotelUpdate: jest.Mock;
  let airlineUpdate: jest.Mock;
  let hotels: Model<Hotel>;
  let airlines: Model<AirlineProfile>;
  let adapter: ProviderManagementAdapter;

  beforeEach(() => {
    hotelUpdate = jest.fn().mockResolvedValue({ matchedCount: 1 });
    airlineUpdate = jest.fn().mockResolvedValue({ matchedCount: 1 });
    hotels = {
      exists: jest.fn().mockReturnValue(query({ _id: id })),
      updateOne: hotelUpdate,
      findById: jest.fn().mockReturnValue(query({ _id: id, active: false, verified: true })),
    } as unknown as Model<Hotel>;
    airlines = {
      exists: jest.fn().mockReturnValue(query({ _id: id })),
      updateOne: airlineUpdate,
      findById: jest.fn().mockReturnValue(query({ _id: id, active: false, verified: true })),
    } as unknown as Model<AirlineProfile>;
    adapter = new ProviderManagementAdapter(hotels, airlines);
  });

  it('validates the requested provider type and identity', async () => {
    await expect(adapter.verifyProvider('HOTEL', id, session)).resolves.toBe(true);
    await expect(adapter.verifyProvider('AIRLINE', id, session)).resolves.toBe(true);
    expect(hotels.exists).toHaveBeenCalled();
    expect(airlines.exists).toHaveBeenCalled();
  });

  it('persists verification and activation in the supplied transaction', async () => {
    await adapter.setProviderVerified('HOTEL', id, true, session);
    await adapter.setProviderActive('AIRLINE', id, false, session);
    expect(hotelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: new Types.ObjectId(id), verified: { $ne: true } }),
      { $set: { verified: true } }, expect.objectContaining({ session }),
    );
    expect(airlineUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ active: { $ne: false } }), { $set: { active: false } },
      expect.objectContaining({ session }),
    );
  });

  it('rejects missing providers and invalid repeated transitions', async () => {
    hotelUpdate.mockResolvedValue({ matchedCount: 0 });
    (hotels.exists as jest.Mock).mockReturnValue(query(null));
    await expect(adapter.setProviderVerified('HOTEL', id, true, session)).rejects.toBeInstanceOf(NotFoundException);
    (hotels.exists as jest.Mock).mockReturnValue(query({ _id: id }));
    (hotels.findById as jest.Mock).mockReturnValue(query({ _id: id, active: true, verified: true }));
    await expect(adapter.setProviderActive('HOTEL', id, true, session)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not activate an unverified provider', async () => {
    airlineUpdate.mockResolvedValue({ matchedCount: 0 });
    (airlines.findById as jest.Mock).mockReturnValue(query({ _id: id, active: false, verified: false }));
    await expect(adapter.setProviderActive('AIRLINE', id, true, session)).rejects.toThrow('verified');
  });
});
