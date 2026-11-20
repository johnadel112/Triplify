import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES } from '../blog/blog-posts.utils';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { ObjectIdPipe } from '../common/http';
import { Principal, UserRole } from '../common/domain';
import { UpdateActivityDto } from './itineraries.dto';
import { ItinerariesService } from './itineraries.service';

@ApiTags('Activities')
@ApiCookieAuth()
@Controller('activities')
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

  @Get('media/:filename')
  @Public()
  @ApiOperation({ summary: 'GEN-08: Serve an activity image of a public itinerary' })
  async media(@Param('filename') filename: string, @Res() res: Response) {
    this.send(res, await this.itinerariesService.activityImagePath(filename));
  }

  @Get('my-media/:filename')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'GEN-08: Serve an activity image of my own (or, for admins, any) itinerary' })
  async myMedia(@CurrentUser() actor: Principal, @Param('filename') filename: string, @Res() res: Response) {
    this.send(res, await this.itinerariesService.activityImagePath(filename, actor));
  }

  private send(res: Response, path: string) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path, (error) => {
      if (error && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Image not found' });
    });
  }

  @Post(':id/images')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'ITN-12, GEN-08: Upload up to 5 JPG/PNG images (max 5 MB each) to my activity',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: {
    images: { type: 'array', items: { type: 'string', format: 'binary' } },
  } } })
  @UseInterceptors(FilesInterceptor('images', 5, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 5 },
  }))
  uploadImages(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
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
