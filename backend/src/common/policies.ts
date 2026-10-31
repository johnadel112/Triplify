import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccountStatus, Principal, ProviderType, UserRole } from './domain';
@Injectable()
export class AccessPolicy {
  ownerOrAdmin(actor: Principal, ownerId: string, administrativeRead = false) {
    if (actor.id !== ownerId && !(administrativeRead && actor.role === UserRole.ADMIN))
      throw new ForbiddenException('Resource access denied');
  }
  providerScope(actor: Principal, type: ProviderType, providerId: string) {
    const role = type === 'HOTEL' ? UserRole.HOTEL_MODERATOR : UserRole.AIRLINE_MODERATOR;
    if (actor.role !== role || actor.providerType !== type || actor.providerId !== providerId)
      throw new ForbiddenException('Provider access denied');
  }
  bookingQuery(actor: Principal, administrativeRead = false): Record<string, string> {
    if (administrativeRead && actor.role === UserRole.ADMIN) return {};
    if (actor.role === UserRole.USER) return { userId: actor.id };
    if (actor.providerId && actor.providerType) {
      this.providerScope(actor, actor.providerType, actor.providerId);
      return { providerId: actor.providerId, providerType: actor.providerType };
    }
    throw new ForbiddenException('Booking access denied');
  }
  contentVisibility(status: AccountStatus, name: string) {
    return {
      showPublicContent: status !== AccountStatus.DEACTIVATED,
      attribution: status === AccountStatus.DEACTIVATED ? 'Deleted user' : name,
    };
  }
}
