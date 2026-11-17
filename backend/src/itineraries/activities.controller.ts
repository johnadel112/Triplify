import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { UpdateActivityDto } from './itineraries.dto';
import { ItinerariesService } from './itineraries.service';

const uploadDir = join(process.cwd(), 'uploads', 'activities');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('Activities')
@ApiCookieAuth()
@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-10: Edit an activity details (title, description, time, cost, location)',
  })
  @ApiOkResponse({ description: 'Activity updated' })
  updateActivity(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.itinerariesService.updateActivity(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-10: Delete an activity from its day' })
  @ApiOkResponse({ description: 'Activity deleted' })
  deleteActivity(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.itinerariesService.deleteActivity(actor, id);
  }

  @Post(':id/images')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-12, GEN-08: Upload activity image(s) with mime-type and size validation',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `activity-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP.`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadImages(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.itinerariesService.uploadActivityImages(actor, id, files || []);
  }

  @Delete(':id/images/:imageId')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'ITN-12: Delete an image from an activity' })
  @ApiOkResponse({ description: 'Image deleted' })
  deleteImage(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.itinerariesService.deleteActivityImage(actor, id, imageId);
  }
}
