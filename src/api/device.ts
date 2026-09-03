import { requestJson } from './client';
import type { NotificationPreferences } from '@/lib/notification-preferences';

export interface DeviceStateResponse {
  installationId: string;
  pushEnabled: boolean;
  timezone: string;
  updatedAt: string | null;
  preferences: NotificationPreferences;
  favorites: string[];
}

export interface DeviceIdentity {
  installationId: string;
  secret: string;
}

function authHeaders({ installationId, secret }: DeviceIdentity): Record<string, string> {
  return { 'x-installation-id': installationId, authorization: `Bearer ${secret}` };
}

/** Enregistre (ou met à jour) l'appareil et son token Expo. Idempotent. */
export function putDevice(
  identity: DeviceIdentity,
  device: {
    expoPushToken?: string | null;
    timezone: string;
    platform?: string;
    appVersion?: string;
  },
): Promise<DeviceStateResponse> {
  return requestJson<DeviceStateResponse>('/v1/device', {
    method: 'PUT',
    body: { ...identity, ...device },
  });
}

export function getDeviceState(identity: DeviceIdentity): Promise<DeviceStateResponse> {
  return requestJson<DeviceStateResponse>('/v1/preferences', { headers: authHeaders(identity) });
}

export function putPreferences(
  identity: DeviceIdentity,
  payload: { preferences?: NotificationPreferences; favorites?: string[] },
): Promise<DeviceStateResponse> {
  return requestJson<DeviceStateResponse>('/v1/preferences', {
    method: 'PUT',
    headers: authHeaders(identity),
    body: payload,
  });
}

/** Retire le token push côté serveur (les préférences sont conservées). */
export function deleteDevicePushToken(identity: DeviceIdentity): Promise<void> {
  return requestJson<void>('/v1/device', { method: 'DELETE', headers: authHeaders(identity) });
}
