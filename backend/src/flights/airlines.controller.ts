import { Body, Controller, Get, Param, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES } from '../blog/blog-posts.utils';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { AirlineCancellationPolicyDto, BaggagePolicyDto, CreateAirlineDto } from './flights.dto';
import { FlightsService } from './flights.service';

/** FLT-01: airline profiles. Admins create airlines; moderators then manage their own. */
@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly flights: FlightsService) {}

  @Post()
  @ApiCookieAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'FLT-01: Admin creates an airline profile; then create its moderator with this id as providerId',
  })
  create(@Body() dto: CreateAirlineDto) {
    return this.flights.createAirline(dto);
  }

  @Get('media/:filename')
  @Public()
  @ApiOperation({ summary: 'FLT-01, GEN-08: Serve an airline logo' })
  async logo(@Param('filename') filename: string, @Res() res: Response) {
    const path = await this.flights.logoPath(filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path, (error) => {
      if (error && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Logo not found' });
    });
  }

  @Post(':id/logo')
  @ApiCookieAuth()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'FLT-01, GEN-08: Upload my airline logo (one JPG/PNG, max 5 MB; replaces the old one)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  uploadLogo(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.flights.setLogo(id, user.providerId, file);
  }

  @Put(':id/baggage-policy')
  @ApiCookieAuth()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'FLT-08: Price per extra bag and max extra bags per passenger (my airline)' })
  baggagePolicy(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: BaggagePolicyDto,
  ) {
    return this.flights.setBaggagePolicy(id, user.providerId, dto);
  }

  @Put(':id/cancellation-policy')
  @ApiCookieAuth()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary: 'FLT-09: Cancellation tiers by days before departure with refund percentages (my airline)',
  })
  cancellationPolicy(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: AirlineCancellationPolicyDto,
  ) {
    return this.flights.setCancellationPolicy(id, user.providerId, dto);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'FLT-01: Public airline profile' })
  get(@Param('id', ObjectIdPipe) id: string) {
    return this.flights.getAirline(id);
  }
}
