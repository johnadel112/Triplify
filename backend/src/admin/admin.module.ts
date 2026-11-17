import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [AuditModule, forwardRef(() => ReportsModule)],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
