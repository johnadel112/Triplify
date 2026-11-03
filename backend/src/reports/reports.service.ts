import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportStatus, ReportTargetType } from './reports.schema';
import { CreateReportDto, ReportQueryDto, ResolveReportDto } from './reports.dto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.schema';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<Report>,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    const existing = await this.reportModel.findOne({
      reporterId: new Types.ObjectId(reporterId),
      targetType: dto.targetType,
      targetId: dto.targetId,
    });

    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_REPORTED',
        message: 'You have already reported this item.',
      });
    }

    const report = new this.reportModel({
      reporterId: new Types.ObjectId(reporterId),
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      status: ReportStatus.OPEN,
      createdAt: new Date(),
    });

    return report.save();
  }

  async listReports(query: ReportQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.targetType) {
      filter.targetType = query.targetType;
    }

    const [items, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .populate('reporterId', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.reportModel.countDocuments(filter),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        reporter: r.reporterId,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        status: r.status,
        resolutionNotes: r.resolutionNotes,
        resolvedBy: r.resolvedBy,
        resolvedAt: r.resolvedAt,
        createdAt: r.createdAt,
      })),
      total,
      page: query.page,
      pageCount: Math.ceil(total / query.limit),
    };
  }

  async resolveReport(adminId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const beforeStatus = report.status;
    let newStatus: ReportStatus = ReportStatus.DISMISSED;
    if (dto.action === 'HIDE') newStatus = ReportStatus.RESOLVED_HIDDEN;
    if (dto.action === 'DELETE') newStatus = ReportStatus.RESOLVED_DELETED;

    report.status = newStatus;
    report.resolutionNotes = dto.notes;
    report.resolvedBy = new Types.ObjectId(adminId);
    report.resolvedAt = new Date();
    await report.save();

    // Record audit log (GEN-07)
    // Note: AuditService.record can run without transaction or with dummy session
    await this.auditService.record(
      adminId,
      `REPORT_${dto.action}`,
      report.id as string,
      'REPORT',
      undefined as any,
      beforeStatus,
      newStatus,
      false,
    );

    // Notify reporter that their report was resolved
    await this.notificationsService.createNotification({
      userId: report.reporterId,
      title: 'Report Update',
      message: `Your report on a ${report.targetType.toLowerCase()} has been reviewed and resolved (${dto.action.toLowerCase()}).`,
      type: NotificationType.REPORT_RESOLVED,
      metadata: { reportId: report.id, action: dto.action },
    });

    return {
      success: true,
      reportId: report.id,
      status: report.status,
    };
  }

  async moderateContent(
    adminId: string,
    targetType: ReportTargetType,
    targetId: string,
    action: 'HIDE' | 'DELETE',
  ) {
    // Record audit log (GEN-07)
    await this.auditService.record(
      adminId,
      `CONTENT_${action}`,
      targetId,
      targetType,
      undefined as any,
      'VISIBLE',
      action === 'HIDE' ? 'HIDDEN' : 'DELETED',
      true,
    );

    // Update all related reports to resolved
    const newStatus =
      action === 'HIDE' ? ReportStatus.RESOLVED_HIDDEN : ReportStatus.RESOLVED_DELETED;
    await this.reportModel.updateMany(
      { targetType, targetId, status: ReportStatus.OPEN },
      {
        $set: {
          status: newStatus,
          resolvedBy: new Types.ObjectId(adminId),
          resolvedAt: new Date(),
          resolutionNotes: `Admin performed content action: ${action}`,
        },
      },
    );

    return {
      success: true,
      targetType,
      targetId,
      action,
    };
  }
}

