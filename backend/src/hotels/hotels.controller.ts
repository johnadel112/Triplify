import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES } from '../blog/blog-posts.utils';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { CreateHotelDto, UpdateHotelDto } from './create-hotel.dto';
import { UpdateHotelPoliciesDto } from './hotel-policies.dto';
import { HotelsService } from './hotels.service';

@ApiTags('Hotels')
@ApiCookieAuth()
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'HTL-01: Create hotel profile' })
  createHotel(@CurrentUser() actor: Principal, @Body() dto: CreateHotelDto) {
    return this.hotelsService.create(dto, actor);
  }

  @Public()
  @Get('media/:filename')
  @ApiOperation({ summary: 'HTL-01, GEN-08: Serve an uploaded hotel photo' })
  async media(@Param('filename') filename: string, @Res() res: Response) {
    const path = await this.hotelsService.imagePath(filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path, (error) => {
      if (error && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Image not found' });
    });
  }

  @Post(':id/images')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-01, GEN-08: Upload up to 5 JPG/PNG photos (max 5 MB each) to my hotel' })
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
    return this.hotelsService.addImages(id, files, actor);
  }

  @Delete(':id/images/:imageId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-01: Remove an uploaded photo from my hotel' })
  removeImage(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.hotelsService.removeImage(id, imageId, actor);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'HTL-02: Public hotel details' })
  getHotel(@Param('id', ObjectIdPipe) id: string) {
    return this.hotelsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-01: Edit assigned hotel profile' })
  updateHotel(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateHotelDto,
  ) {
    return this.hotelsService.update(id, dto, actor);
  }

  @Patch(':id/policies')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-09/10: Update hotel local check-in/out times and cancellation tiers' })
  updatePolicies(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateHotelPoliciesDto,
  ) {
    return this.hotelsService.updatePolicies(id, dto, actor);
  }
}
