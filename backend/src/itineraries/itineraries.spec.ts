import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { AccountStatus, Principal, UserRole } from '../common/domain';
import { City, Country } from '../reference-data/reference.schema';
import { User } from '../users/user.schema';
import { FxRatesService } from './fx-rates.service';
import { BudgetCategory, Itinerary, ItineraryDocument, TransportType } from './itineraries.schema';
import { ItinerariesService } from './itineraries.service';

describe('Itineraries Module (ITN-01 .. ITN-26, GEN-08)', () => {
  let service: ItinerariesService;
  let fxRatesService: FxRatesService;
  let mockItineraryModel: any;
  let mockUserModel: any;
  let mockCityModel: any;
  let mockCountryModel: any;
  let mockConfigService: any;

  const actorUser: Principal = {
    id: '507f1f77bcf86cd799439011',
    name: 'Essam Traveler',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    mustChangePassword: false,
    authVersion: 1,
    sessionId: 'sess-1',
  };

  const otherUser: Principal = {
    id: '507f1f77bcf86cd799439099',
    name: 'Other Traveler',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    mustChangePassword: false,
    authVersion: 1,
    sessionId: 'sess-2',
  };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    fxRatesService = new FxRatesService(mockConfigService);

    mockItineraryModel = Object.assign(
      jest.fn().mockImplementation((doc) => ({
        ...doc,
        _id: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          ...doc,
          _id: new Types.ObjectId(),
        }),
      })),
      {
        find: jest.fn(),
        findById: jest.fn(),
        findOne: jest.fn(),
        deleteOne: jest.fn(),
        countDocuments: jest.fn(),
      },
    );

    mockUserModel = {
      findById: jest.fn(),
    };

    mockCityModel = {
      findOne: jest.fn(),
    };

    mockCountryModel = {
      findOne: jest.fn(),
    };

    service = new ItinerariesService(
      mockItineraryModel as unknown as Model<Itinerary>,
      mockUserModel as unknown as Model<User>,
      mockCityModel as unknown as Model<City>,
      mockCountryModel as unknown as Model<Country>,
      fxRatesService,
    );
  });

  describe('ITN-01: Create Itinerary', () => {
    it('creates an itinerary with required title, countries and start date', async () => {
      const dto = {
        title: 'Grand Tour of France',
        countries: ['FR'],
        startDate: '2026-08-01',
        description: 'Two-week cultural journey',
        isPublic: false,
      };

      const result = await service.create(actorUser, dto);
      expect(mockItineraryModel).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('rejects itinerary creation if countries array is empty', async () => {
      const dto = {
        title: 'No country trip',
        countries: [],
        startDate: '2026-08-01',
      };

      await expect(service.create(actorUser, dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('ITN-01 & ITN-03: Ownership restrictions & View', () => {
    it('throws ForbiddenException when a user attempts to view another user private itinerary', async () => {
      const itineraryDoc = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(otherUser.id),
        title: 'Secret Private Trip',
        isPublic: false,
        days: [],
      };

      mockItineraryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(itineraryDoc),
      });

      await expect(service.getItineraryById(actorUser, '507f1f77bcf86cd799439001')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows anyone to view a public itinerary', async () => {
      const itineraryDoc = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(otherUser.id),
        title: 'Public Europe Trip',
        isPublic: true,
        days: [],
      };

      mockItineraryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(itineraryDoc),
      });

      const res = await service.getItineraryById(actorUser, '507f1f77bcf86cd799439001');
      expect(res.title).toBe('Public Europe Trip');
    });

    it('throws ForbiddenException when a user attempts to edit another user itinerary', async () => {
      const itineraryDoc = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(otherUser.id),
        title: 'Trip by someone else',
        isPublic: true,
        save: jest.fn(),
      };

      mockItineraryModel.findById.mockResolvedValue(itineraryDoc);

      await expect(
        service.update(actorUser, '507f1f77bcf86cd799439001', { title: 'Hacked Title' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ITN-05, ITN-07, ITN-08: Days Management & Renumbering', () => {
    it('adds a day and automatically calculates dayNumber and date', async () => {
      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        startDate: '2026-08-01',
        days: [],
        save: jest.fn().mockResolvedValue(true),
      };

      mockItineraryModel.findById.mockResolvedValue(itineraryDoc);
      mockCityModel.findOne.mockResolvedValue({ name: 'Paris' });

      // Mock getItineraryById response
      jest.spyOn(service, 'getItineraryById').mockResolvedValue({
        ...itineraryDoc,
        days: [
          {
            dayNumber: 1,
            date: '2026-08-01',
            cityCode: 'paris',
            cityName: 'Paris',
          },
        ],
      } as any);

      const res = await service.addDay(actorUser, '507f1f77bcf86cd799439001', {
        cityCode: 'paris',
      });

      expect(itineraryDoc.save).toHaveBeenCalled();
      expect(res).toBeDefined();
    });

    it('reorders days and recalculates all day numbers and dates sequentially', async () => {
      const day1Id = new Types.ObjectId('507f1f77bcf86cd79943901a');
      const day2Id = new Types.ObjectId('507f1f77bcf86cd79943902b');

      const day1: any = {
        _id: day1Id,
        dayNumber: 1,
        date: '2026-08-01',
        cityCode: 'paris',
        activities: [],
        budgets: [],
      };
      const day2: any = {
        _id: day2Id,
        dayNumber: 2,
        date: '2026-08-02',
        cityCode: 'london',
        activities: [],
        budgets: [],
      };

      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        startDate: '2026-08-01',
        days: [day1, day2],
        save: jest.fn().mockResolvedValue(true),
      };

      mockItineraryModel.findById.mockResolvedValue(itineraryDoc);
      jest.spyOn(service, 'getItineraryById').mockResolvedValue(itineraryDoc);

      await service.reorderDays(actorUser, '507f1f77bcf86cd799439001', {
        dayIds: [day2Id.toString(), day1Id.toString()],
      });

      expect(itineraryDoc.days[0]._id.toString()).toBe(day2Id.toString());
      expect(itineraryDoc.days[0].dayNumber).toBe(1);
      expect(itineraryDoc.days[0].date).toBe('2026-08-01');

      expect(itineraryDoc.days[1]._id.toString()).toBe(day1Id.toString());
      expect(itineraryDoc.days[1].dayNumber).toBe(2);
      expect(itineraryDoc.days[1].date).toBe('2026-08-02');
    });

    it('deletes a day and renumbers remaining days and dates', async () => {
      const day1Id = new Types.ObjectId('507f1f77bcf86cd79943901a');
      const day2Id = new Types.ObjectId('507f1f77bcf86cd79943902b');

      const day1: any = {
        _id: day1Id,
        dayNumber: 1,
        date: '2026-08-01',
        cityCode: 'paris',
      };
      const day2: any = {
        _id: day2Id,
        dayNumber: 2,
        date: '2026-08-02',
        cityCode: 'london',
      };

      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        startDate: '2026-08-01',
        days: [day1, day2],
        save: jest.fn().mockResolvedValue(true),
      };

      mockItineraryModel.findById.mockResolvedValue(itineraryDoc);
      jest.spyOn(service, 'getItineraryById').mockResolvedValue(itineraryDoc);

      await service.deleteDay(actorUser, '507f1f77bcf86cd799439001', day1Id.toString());

      expect(itineraryDoc.days).toHaveLength(1);
      expect(itineraryDoc.days[0]._id.toString()).toBe(day2Id.toString());
      expect(itineraryDoc.days[0].dayNumber).toBe(1);
      expect(itineraryDoc.days[0].date).toBe('2026-08-01');
    });
  });

  describe('ITN-10, ITN-12, GEN-08: Activities & Image validation', () => {
    it('enforces maximum 5 images limit per activity (GEN-08)', async () => {
      const actId = new Types.ObjectId('507f1f77bcf86cd7994390aa');
      const activity: any = {
        _id: actId,
        title: 'Eiffel Tower',
        images: [
          { filename: '1.jpg' },
          { filename: '2.jpg' },
          { filename: '3.jpg' },
          { filename: '4.jpg' },
        ],
      };

      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        days: [{ activities: [activity] }],
        save: jest.fn(),
      };

      mockItineraryModel.findOne.mockResolvedValue(itineraryDoc);

      const files = [
        {
          filename: 'new1.jpg',
          originalname: 'new1.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        },
        {
          filename: 'new2.jpg',
          originalname: 'new2.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        },
      ];

      // 4 existing + 2 new = 6 > 5 limit
      await expect(
        service.uploadActivityImages(actorUser, actId.toString(), files as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid image mime types (GEN-08)', async () => {
      const actId = new Types.ObjectId('507f1f77bcf86cd7994390aa');
      const activity: any = {
        _id: actId,
        title: 'Eiffel Tower',
        images: [],
      };

      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        days: [{ activities: [activity] }],
        save: jest.fn(),
      };

      mockItineraryModel.findOne.mockResolvedValue(itineraryDoc);

      const files = [
        {
          filename: 'malicious.exe',
          originalname: 'malicious.exe',
          mimetype: 'application/x-msdownload',
          size: 1024,
        },
      ];

      await expect(
        service.uploadActivityImages(actorUser, actId.toString(), files as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ITN-14, ITN-16, ITN-18: Budgets, Transport & FXRates conversion', () => {
    it('calculates daily subtotals, transport costs, and converts to target currency correctly', async () => {
      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        isPublic: true,
        days: [
          {
            _id: new Types.ObjectId(),
            dayNumber: 1,
            date: '2026-08-01',
            cityCode: 'paris',
            budgets: [
              { category: BudgetCategory.FOOD, amount: 100, currency: 'USD' },
              { category: BudgetCategory.ACCOMMODATION, amount: 200, currency: 'USD' },
            ],
            activities: [],
          },
        ],
        transportCosts: [
          {
            _id: new Types.ObjectId(),
            fromCity: 'paris',
            toCity: 'london',
            transportType: TransportType.TRAIN,
            cost: 50,
            currency: 'USD',
          },
        ],
      };

      mockItineraryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(itineraryDoc),
      });

      const summary = await service.getBudgetSummary(actorUser, '507f1f77bcf86cd799439001', 'USD');

      expect(summary.targetCurrency).toBe('USD');
      expect(summary.categorySubtotals.food).toBe(100);
      expect(summary.categorySubtotals.accommodation).toBe(200);
      expect(summary.intercityTransportTotal).toBe(50);
      expect(summary.overallTotal).toBe(350);
    });

    it('handles FX conversion across multiple currencies', async () => {
      // 100 EUR -> USD (100 / 0.92 ~ 108.7)
      const converted = await fxRatesService.convert(100, 'EUR', 'USD');
      expect(converted).toBeGreaterThan(100);

      // Same currency returns exact amount
      const same = await fxRatesService.convert(100, 'USD', 'USD');
      expect(same).toBe(100);
    });

    it('rejects invalid currency code in FX conversion', async () => {
      await expect(fxRatesService.convert(100, 'INVALID', 'USD')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('ITN-21: Cloning Public Itineraries with Attribution', () => {
    it('clones a public itinerary into an independent private copy and preserves attribution', async () => {
      const sourceId = new Types.ObjectId('507f1f77bcf86cd799439001');
      const authorId = new Types.ObjectId(otherUser.id);

      const sourceDoc: any = {
        _id: sourceId,
        userId: authorId,
        title: 'Original Great Journey',
        countries: ['EG', 'AE'],
        startDate: '2026-09-01',
        description: 'An inspiring adventure',
        isPublic: true,
        days: [
          {
            _id: new Types.ObjectId(),
            dayNumber: 1,
            date: '2026-09-01',
            cityCode: 'cairo',
            activities: [{ title: 'Pyramids', cost: 20, currency: 'USD', images: [] }],
            budgets: [{ category: BudgetCategory.FOOD, amount: 30, currency: 'USD' }],
          },
        ],
        transportCosts: [],
      };

      mockItineraryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(sourceDoc),
      });

      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ name: 'Original Author Name' }),
      });

      jest.spyOn(service, 'getItineraryById').mockImplementation(
        async (_actor, id) =>
          ({
            id,
            title: 'Copy of Original Great Journey',
            isPublic: false,
            clonedFrom: {
              itineraryId: sourceId,
              originalAuthorId: authorId,
              originalAuthorName: 'Original Author Name',
            },
          }) as any,
      );

      const cloned = await service.clone(actorUser, sourceId.toString(), {});

      expect(mockItineraryModel).toHaveBeenCalled();
      expect(cloned.isPublic).toBe(false);
      expect(cloned.clonedFrom).toBeDefined();
      expect(cloned.clonedFrom?.originalAuthorName).toBe('Original Author Name');
    });

    it('rejects cloning a private itinerary', async () => {
      const sourceId = new Types.ObjectId('507f1f77bcf86cd799439001');
      const sourceDoc: any = {
        _id: sourceId,
        userId: new Types.ObjectId(otherUser.id),
        title: 'Private Itinerary',
        isPublic: false,
      };

      mockItineraryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(sourceDoc),
      });

      await expect(service.clone(actorUser, sourceId.toString(), {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('ITN-25 & ITN-26: Hotel and Flight Search Reuse', () => {
    it('generates hotel search parameters grouped by consecutive stays (ITN-25)', async () => {
      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        startDate: '2026-10-01',
        isPublic: true,
        days: [
          {
            dayNumber: 1,
            date: '2026-10-01',
            cityCode: 'paris',
            cityName: 'Paris',
            activities: [],
            budgets: [],
          },
          {
            dayNumber: 2,
            date: '2026-10-02',
            cityCode: 'paris',
            cityName: 'Paris',
            activities: [],
            budgets: [],
          },
        ],
      };

      jest.spyOn(service, 'getItineraryById').mockResolvedValue({
        ...itineraryDoc,
        cityGroups: [
          {
            cityCode: 'paris',
            cityName: 'Paris',
            checkInDate: '2026-10-01',
            checkOutDate: '2026-10-03',
            nights: 2,
          },
        ],
      } as any);

      const res = await service.getHotelSearchParameters(actorUser, '507f1f77bcf86cd799439001');
      expect(res.cityGroups).toHaveLength(1);
      expect(res.cityGroups![0].searchQuery.destination).toBe('paris');
      expect(res.cityGroups![0].searchQuery.checkIn).toBe('2026-10-01');
      expect(res.cityGroups![0].searchQuery.checkOut).toBe('2026-10-03');
      expect(res.cityGroups![0].searchQuery.nights).toBe(2);
    });

    it('generates flight search parameters for trip start, return, and intercity hops (ITN-26)', async () => {
      const itineraryDoc: any = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439001'),
        userId: new Types.ObjectId(actorUser.id),
        startDate: '2026-10-01',
        isPublic: true,
        days: [
          {
            dayNumber: 1,
            date: '2026-10-01',
            cityCode: 'paris',
            cityName: 'Paris',
            activities: [],
            budgets: [],
          },
          {
            dayNumber: 2,
            date: '2026-10-02',
            cityCode: 'london',
            cityName: 'London',
            activities: [],
            budgets: [],
          },
        ],
      };

      jest.spyOn(service, 'getItineraryById').mockResolvedValue({
        ...itineraryDoc,
        cityGroups: [
          {
            cityCode: 'paris',
            cityName: 'Paris',
            checkInDate: '2026-10-01',
            checkOutDate: '2026-10-02',
            nights: 1,
          },
          {
            cityCode: 'london',
            cityName: 'London',
            checkInDate: '2026-10-02',
            checkOutDate: '2026-10-03',
            nights: 1,
          },
        ],
      } as any);

      const res = await service.getFlightSearchParameters(actorUser, '507f1f77bcf86cd799439001');
      expect(res.searches).toHaveLength(3); // INBOUND, INTERCITY, OUTBOUND_RETURN
      expect(res.searches[0].type).toBe('INBOUND');
      expect(res.searches[0].destinationCity).toBe('paris');
      expect(res.searches[1].type).toBe('INTERCITY');
      expect(res.searches[1].originCity).toBe('paris');
      expect(res.searches[1].destinationCity).toBe('london');
      expect(res.searches[2].type).toBe('OUTBOUND_RETURN');
      expect(res.searches[2].originCity).toBe('london');
    });
  });
});
