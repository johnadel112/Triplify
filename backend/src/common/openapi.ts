import { OpenAPIObject } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

// Explicit response contracts supplement reflected DTO request schemas.
export function addResponseContracts(document: OpenAPIObject) {
  const string: SchemaObject = { type: 'string' };
  const date: SchemaObject = { type: 'string', format: 'date-time' };
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const page = (items: SchemaObject | { $ref: string }): SchemaObject => ({
    type: 'object',
    required: ['items', 'total', 'page', 'pageCount'],
    properties: {
      items: { type: 'array', items },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageCount: { type: 'integer' },
    },
  });
  const schemas: Record<string, SchemaObject> = {
    SafeUser: {
      type: 'object',
      required: ['id', 'name', 'email', 'role', 'status', 'mustChangePassword'],
      properties: {
        id: string,
        name: string,
        email: { type: 'string', format: 'email' },
        phoneNumber: string,
        preferredCurrency: string,
        role: { type: 'string', enum: ['USER', 'ADMIN', 'HOTEL_MODERATOR', 'AIRLINE_MODERATOR'] },
        status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] },
        providerId: string,
        providerType: { type: 'string', enum: ['HOTEL', 'AIRLINE'] },
        mustChangePassword: { type: 'boolean' },
        createdAt: date,
      },
    },
    AccountSummary: {
      type: 'object',
      properties: {
        id: string,
        name: string,
        email: string,
        role: string,
        status: string,
        createdAt: date,
      },
    },
    Error: {
      type: 'object',
      required: ['statusCode', 'code', 'message'],
      properties: {
        statusCode: { type: 'integer' },
        code: string,
        message: string,
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: { field: string, messages: { type: 'array', items: string } },
          },
        },
      },
    },
    Success: { type: 'object', properties: { success: { type: 'boolean' } } },
    PasswordChanged: {
      type: 'object',
      properties: { success: { type: 'boolean' }, reauthenticate: { type: 'boolean' } },
    },
    Login: { type: 'object', properties: { user: ref('SafeUser'), routeHint: string } },
    TemporaryPassword: {
      type: 'object',
      properties: {
        temporaryPassword: { type: 'string', description: 'Shown once; do not log or persist' },
        mustChangePassword: { type: 'boolean' },
      },
    },
    AccountStateChange: {
      type: 'object',
      properties: {
        user: ref('SafeUser'),
        notificationStatus: { type: 'string', enum: ['PENDING_INTEGRATION'] },
      },
    },
    ProviderStateChange: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        notificationStatus: { type: 'string', enum: ['PENDING_INTEGRATION'] },
      },
    },
    BookingSummary: {
      type: 'object',
      properties: {
        reference: string,
        type: { type: 'string', enum: ['FLIGHT', 'HOTEL'] },
        user: { type: 'object', properties: { id: string, name: string } },
        provider: { type: 'object', properties: { id: string, name: string } },
        startDate: date,
        endDate: date,
        amount: {
          type: 'object',
          properties: {
            value: { type: 'string', description: 'Decimal string' },
            currency: string,
          },
        },
        status: string,
      },
    },
    Country: { type: 'object', properties: { code: string, name: string } },
    City: {
      type: 'object',
      properties: { code: string, name: string, country: string, timeZone: string },
    },
    Airport: {
      type: 'object',
      properties: {
        iataCode: string,
        name: string,
        city: string,
        country: string,
        timeZone: string,
      },
    },
    Currency: {
      type: 'object',
      properties: { code: string, name: string, minorUnits: { type: 'integer' } },
    },
    Health: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
  };
  document.components ??= {};
  document.components.schemas = { ...document.components.schemas, ...schemas };
  for (const [path, item] of Object.entries(document.paths))
    for (const method of ['get', 'post', 'patch'] as const) {
      const operation = item[method];
      if (!operation) continue;
      let result: SchemaObject | { $ref: string } = ref('Success');
      if (path.endsWith('/health')) result = ref('Health');
      else if (path.includes('/reference/')) {
        const name = path.endsWith('countries')
          ? 'Country'
          : path.endsWith('cities')
            ? 'City'
            : path.endsWith('airports')
              ? 'Airport'
              : 'Currency';
        result = page(ref(name));
      } else if (path.endsWith('/auth/login')) result = ref('Login');
      else if (
        path.endsWith('/auth/register') ||
        path.endsWith('/me') ||
        path.endsWith('/admin/moderators')
      )
        result = ref('SafeUser');
      else if (path.endsWith('/me/password')) result = ref('PasswordChanged');
      else if (path.endsWith('/admin/users')) result = page(ref('AccountSummary'));
      else if (path.endsWith('/admin/bookings')) result = page(ref('BookingSummary'));
      else if (path.endsWith('/reset-password')) result = ref('TemporaryPassword');
      else if (path.includes('/admin/providers/')) result = ref('ProviderStateChange');
      else if (path.includes('/admin/')) result = ref('AccountStateChange');
      const status =
        method === 'post' &&
        (path.endsWith('/register') ||
          path.endsWith('/moderators') ||
          path.endsWith('/reset-password'))
          ? '201'
          : '200';
      operation.responses = {
        [status]: { description: 'Success', content: { 'application/json': { schema: result } } },
      };
      for (const code of [400, 401, 403, 404, 409, 429, 500, 503])
        operation.responses[code] = {
          description: {
            400: 'Validation error',
            401: 'Authentication required or invalid credentials',
            403: 'Forbidden, CSRF rejected or password change required',
            404: 'Resource not found',
            409: 'Duplicate key or invalid transition',
            429: 'Rate limit or account lockout',
            500: 'Internal error',
            503: 'Required integration unavailable',
          }[code]!,
          content: { 'application/json': { schema: ref('Error') } },
        };
      if (method !== 'get')
        operation.parameters = [
          ...(operation.parameters ?? []),
          {
            in: 'header',
            name: 'X-Triplify-CSRF',
            required: true,
            schema: { type: 'string', enum: ['1'] },
            description: 'Also requires browser Origin in FRONTEND_URL allowlist',
          },
        ];
      if (
        path.includes('/reference/') ||
        path.endsWith('/health') ||
        path.endsWith('/register') ||
        path.endsWith('/login')
      )
        operation.security = [];
      if (path.endsWith('/refresh')) operation.security = [{ refresh_token: [] }];
    }
  document.components.securitySchemes = {
    ...document.components.securitySchemes,
    refresh_token: { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
  };
  return document;
}
