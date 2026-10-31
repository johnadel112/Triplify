import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { AccountStatus, ProviderType, UserRole } from '../common/domain';
@Schema({ timestamps: true, optimisticConcurrency: true })
export class User {
  @Prop({ required: true, trim: true, maxlength: 100 }) name!: string;
  @Prop({ required: true, lowercase: true, trim: true, unique: true, maxlength: 254 })
  email!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop({ maxlength: 30 }) phoneNumber?: string;
  @Prop({ default: 'USD' }) preferredCurrency!: string;
  @Prop({ enum: UserRole, default: UserRole.USER, required: true }) role!: UserRole;
  @Prop({ enum: AccountStatus, default: AccountStatus.ACTIVE, required: true })
  status!: AccountStatus;
  @Prop() termsAcceptedAt?: Date;
  @Prop({ default: 0, select: false }) failedLoginAttempts!: number;
  @Prop({ select: false }) lockedUntil?: Date;
  @Prop({ default: false }) mustChangePassword!: boolean;
  @Prop({ type: MongooseSchema.Types.ObjectId }) providerId?: Types.ObjectId;
  @Prop({ type: String, enum: ['HOTEL', 'AIRLINE'] }) providerType?: ProviderType;
  @Prop({ default: 0, select: false }) authVersion!: number;
  @Prop({ default: 0, select: false }) loginRevision!: number;
  @Prop() lastLoginAt?: Date;
  @Prop() deactivatedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ role: 1, status: 1, createdAt: -1 });
UserSchema.pre('validate', function () {
  const expected =
    this.role === UserRole.HOTEL_MODERATOR
      ? 'HOTEL'
      : this.role === UserRole.AIRLINE_MODERATOR
        ? 'AIRLINE'
        : undefined;
  if (
    expected
      ? !this.providerId || this.providerType !== expected
      : !!this.providerId || !!this.providerType
  )
    this.invalidate('providerId', 'Role and provider assignment are inconsistent');
});
export function publicUser(u: UserDocument) {
  return {
    id: u.id as string,
    name: u.name,
    email: u.email,
    phoneNumber: u.phoneNumber,
    preferredCurrency: u.preferredCurrency,
    role: u.role,
    status: u.status,
    providerId: u.providerId?.toString(),
    providerType: u.providerType,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}
