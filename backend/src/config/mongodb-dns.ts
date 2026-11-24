import { setServers } from 'node:dns';
import { isIP } from 'node:net';

export function parseMongoDnsServers(value?: string): string[] {
  if (!value?.trim()) return [];
  const servers = value
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  if (!servers.length || servers.some((server) => !isIP(server))) {
    throw new Error('MONGODB_DNS_SERVERS must contain comma-separated IP addresses');
  }
  return servers;
}

export function configureMongoDns(value?: string) {
  const servers = parseMongoDnsServers(value);
  if (servers.length) setServers(servers);
}

export function buildMongoConnectionUri(
  uri: string,
  directHostsValue?: string,
  replicaSetValue?: string,
): string {
  const directHosts = directHostsValue
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  const replicaSet = replicaSetValue?.trim();
  if (!uri.startsWith('mongodb+srv://')) return uri;
  if (!directHosts?.length && !replicaSet) return uri;
  if (!directHosts?.length || !replicaSet) {
    throw new Error('MONGODB_DIRECT_HOSTS and MONGODB_REPLICA_SET must be configured together');
  }
  if (directHosts.some((host) => !/^[a-z0-9.-]+:\d{1,5}$/i.test(host))) {
    throw new Error('MONGODB_DIRECT_HOSTS must contain comma-separated host:port values');
  }
  if (!/^[a-z0-9-]+$/i.test(replicaSet)) {
    throw new Error('MONGODB_REPLICA_SET is invalid');
  }

  const prefix = 'mongodb+srv://';
  const pathStart = uri.indexOf('/', prefix.length);
  if (pathStart < 0) throw new Error('MONGODB_URI must select a database');
  const authority = uri.slice(prefix.length, pathStart);
  const credentialEnd = authority.lastIndexOf('@');
  const credentials = credentialEnd >= 0 ? authority.slice(0, credentialEnd + 1) : '';
  const remainder = uri.slice(pathStart);
  const queryStart = remainder.indexOf('?');
  const databasePath = queryStart >= 0 ? remainder.slice(0, queryStart) : remainder;
  const params = new URLSearchParams(queryStart >= 0 ? remainder.slice(queryStart + 1) : '');
  params.set('tls', 'true');
  params.set('authSource', 'admin');
  params.set('replicaSet', replicaSet);
  return `mongodb://${credentials}${directHosts.join(',')}${databasePath}?${params.toString()}`;
}
