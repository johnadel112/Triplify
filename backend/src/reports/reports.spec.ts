import { ConflictException, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Report, ReportStatus, ReportTargetType } from './reports.schema';
import { ReportsService } from './reports.service';

describe('Reports & Moderation Module (GEN-09, GEN-10, GEN-07)', () => {
  let service: ReportsService;
  let mockReportModel: jest.Mock & {
    findOne: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    updateMany: jest.Mock;
  };
  let mockAuditService: { record: jest.Mock };
  let mockNotificationsService: { createNotification: jest.Mock };

  beforeEach(() => {
    mockReportModel = Object.assign(jest.fn(), {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      updateMany: jest.fn(),
    });

    mockAuditService = {
      record: jest.fn().mockResolvedValue({}),
    };

    mockNotificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    service = new ReportsService(
      mockReportModel as unknown as Model<Report>,
      mockAuditService as unknown as AuditService,
      mockNotificationsService as unknown as NotificationsService,
    );
  });

  describe('GEN-09: User content reporting', () => {
    it('throws ConflictException if user attempts to report the same item more than once', async () => {
      mockReportModel.findOne.mockResolvedValue({ id: 'existing-report' });

      await expect(
        service.createReport('507f1f77bcf86cd799439011', {
          targetType: ReportTargetType.POST,
          targetId: '507f1f77bcf86cd799439022',
          reason: 'Spam or inappropriate content',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('GEN-10 & GEN-07: Admin report resolution and audit logging', () => {
    it('throws NotFoundException if report is not found', async () => {
      mockReportModel.findById.mockResolvedValue(null);

      await expect(
        service.resolveReport('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439099', {
          action: 'DISMISS',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves report and writes audit log', async () => {
      const mockReport = {
        id: 'report-1',
        reporterId: '507f1f77bcf86cd799439011',
        targetType: ReportTargetType.COMMENT,
        status: ReportStatus.OPEN,
        save: jest.fn().mockResolvedValue({}),
      };
      mockReportModel.findById.mockResolvedValue(mockReport);

      const result = await service.resolveReport('507f1f77bcf86cd799439000', 'report-1', {
        action: 'DISMISS',
        notes: 'No violation found',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(ReportStatus.DISMISSED);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439000',
        'REPORT_DISMISS',
        'report-1',
        'REPORT',
        undefined,
        ReportStatus.OPEN,
        ReportStatus.DISMISSED,
        false,
      );
    });

    it('moderates content and logs administrative action (GEN-07)', async () => {
      mockReportModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await service.moderateContent(
        '507f1f77bcf86cd799439000',
        ReportTargetType.POST,
        'post-123',
        'DELETE',
      );

      expect(result.success).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439000',
        'CONTENT_DELETE',
        'post-123',
        ReportTargetType.POST,
        undefined,
        'VISIBLE',
        'DELETED',
        true,
      );
    });
  });
});
