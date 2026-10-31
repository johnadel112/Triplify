import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
@Module({ imports: [AuditModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
