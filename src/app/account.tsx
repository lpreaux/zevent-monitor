import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useClerk, useUser } from '@clerk/expo';
import Ionicons from '@expo/vector-icons/Ionicons';

import { unlinkAccount } from '@/api/device';
import { LoadingState } from '@/components/screen-state';
import { useAccountSync, type AccountSyncStatus } from '@/lib/use-account-sync';
import { useFavoritesStore } from '@/store/favorites';
import { useNotificationsStore } from '@/store/notifications';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const statusTone: Record<AccountSyncStatus, { dot: string; text: string }> = {
  idle: { dot: 'bg-gray-600', text: 'text-gray-400' },
  syncing: { dot: 'bg-zevent-400', text: 'text-zevent-200' },
  synced: { dot: 'bg-green-400', text: 'text-green-300' },
  error: { dot: 'bg-red-400', text: 'text-red-300' },
};

function statusLabel(status: AccountSyncStatus, lastSyncedAt: string | null): string {
  if (status === 'syncing') return 'Synchronisation en cours…';
  if (status === 'error') return 'Dernière synchronisation en échec';
  if (status === 'synced' && lastSyncedAt) {
    const at = new Date(lastSyncedAt).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `À jour depuis ${at}`;
  }
  if (status === 'synced') return 'Compte à jour';
  return 'En attente de synchronisation';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

/** Nom du fournisseur OAuth tel que Clerk le renvoie (`oauth_twitch`, `twitch`…). */
function providerLabel(provider: string | undefined): string | null {
  if (!provider) return null;
  const name = provider.replace(/^oauth_/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-gray-500">
      {children}
    </Text>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-2xl font-extrabold text-white">{value}</Text>
      <Text className="text-[11px] uppercase tracking-wider text-gray-500">{label}</Text>
    </View>
  );
}

interface ActionRowProps {
  icon: IconName;
  label: string;
  hint?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onPress: () => void;
}

/** Ligne pleine largeur séparée par un filet : l'écran n'utilise pas de cartes. */
function ActionRow({ icon, label, hint, tone = 'default', busy = false, onPress }: ActionRowProps) {
  const danger = tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      className="flex-row items-center gap-4 border-b border-white/5 py-4 active:opacity-60"
    >
      <Ionicons name={icon} size={20} color={danger ? '#f87171' : colors.brandSoft} />
      <View className="flex-1">
        <Text className={`text-[15px] font-semibold ${danger ? 'text-red-300' : 'text-gray-100'}`}>
          {label}
        </Text>
        {hint ? <Text className="mt-0.5 text-xs text-gray-500">{hint}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#4b5563" />
      )}
    </Pressable>
  );
}

function AccountContent() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const sync = useAccountSync();
  const favorites = useFavoritesStore((s) => s.favorites);
  const [signingOut, setSigningOut] = useState(false);

  const disconnect = async () => {
    setSigningOut(true);
    try {
      const identity = useNotificationsStore.getState().identity;
      const token = await getToken();
      if (identity && token) await unlinkAccount(identity, token);
      await signOut();
    } catch (cause) {
      setSigningOut(false);
      Alert.alert(
        'Déconnexion impossible',
        cause instanceof Error ? cause.message : 'Réessayez dans un instant.',
      );
    }
  };

  const confirmDisconnect = () => {
    Alert.alert(
      'Se déconnecter ?',
      'Cet appareil ne sera plus synchronisé. Vos favoris et réglages actuels y restent disponibles.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => void disconnect() },
      ],
    );
  };

  if (!isLoaded) return <LoadingState label="Chargement du compte…" />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  const name =
    user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Utilisateur ZEvent';
  const email = user?.primaryEmailAddress?.emailAddress;
  const provider = providerLabel(user?.externalAccounts?.[0]?.provider);
  const tone = statusTone[sync.status];

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-8 px-5 pb-14 pt-7">
        <View className="flex-row items-center gap-4">
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              accessibilityIgnoresInvertColors
              className="h-16 w-16 rounded-full border border-white/10"
            />
          ) : (
            <View className="h-16 w-16 items-center justify-center rounded-full bg-zevent-500/20">
              <Text className="text-xl font-extrabold text-zevent-200">{initials(name)}</Text>
            </View>
          )}
          <View className="flex-1 gap-1">
            <Text numberOfLines={1} className="text-[22px] font-extrabold text-white">
              {name}
            </Text>
            {email ? (
              <Text numberOfLines={1} className="text-sm text-gray-400">
                {email}
              </Text>
            ) : null}
            {provider ? (
              <Text className="text-xs text-gray-500">Connecté via {provider}</Text>
            ) : null}
          </View>
        </View>

        <View className="gap-3">
          <SectionLabel>Synchronisation</SectionLabel>
          <View className="flex-row items-center gap-3">
            <View className={`h-2 w-2 rounded-full ${tone.dot}`} />
            <Text className={`flex-1 text-sm ${tone.text}`}>
              {statusLabel(sync.status, sync.lastSyncedAt)}
            </Text>
            <Pressable
              onPress={() => void sync.synchronize()}
              disabled={sync.status === 'syncing'}
              accessibilityRole="button"
              accessibilityLabel="Synchroniser maintenant"
              className={`flex-row items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 active:opacity-60 ${
                sync.status === 'syncing' ? 'opacity-50' : ''
              }`}
            >
              <Ionicons name="sync" size={14} color={colors.brandSoft} />
              <Text className="text-xs font-semibold text-zevent-200">Actualiser</Text>
            </Pressable>
          </View>
          {sync.error ? (
            <Text className="text-[13px] leading-5 text-red-300">{sync.error}</Text>
          ) : null}

          <View className="mt-2 flex-row">
            <Stat value={String(favorites.length)} label="Favoris" />
            <View className="w-px bg-white/5" />
            <View className="flex-1 pl-5">
              <Stat
                value={sync.deviceCount > 0 ? String(sync.deviceCount) : '—'}
                label={sync.deviceCount > 1 ? 'Appareils liés' : 'Appareil lié'}
              />
            </View>
          </View>
        </View>

        <View className="gap-1">
          <SectionLabel>Réglages</SectionLabel>
          <ActionRow
            icon="notifications-outline"
            label="Notifications"
            hint="Seuils, paliers et plage silencieuse"
            onPress={() => router.push('/settings/notifications')}
          />
          <ActionRow
            icon="heart-outline"
            label="Mes favoris"
            hint={
              favorites.length > 0
                ? `${favorites.length} streamer${favorites.length > 1 ? 's' : ''} suivi${
                    favorites.length > 1 ? 's' : ''
                  }`
                : 'Aucun favori pour l’instant'
            }
            onPress={() => router.push('/(tabs)/streamers' as never)}
          />
          <ActionRow
            icon="log-out-outline"
            label="Se déconnecter"
            tone="danger"
            busy={signingOut}
            onPress={confirmDisconnect}
          />
        </View>

        <Text className="text-xs leading-5 text-gray-600">
          Favoris et réglages d’alertes sont fusionnés entre vos appareils connectés. Le choix de
          recevoir des notifications push, lui, reste propre à chaque appareil.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AccountScreen() {
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} />
          <Text className="text-center text-[15px] leading-6 text-gray-400">
            La synchronisation de compte n’est pas configurée sur cette version de l’application.
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  return <AccountContent />;
}
