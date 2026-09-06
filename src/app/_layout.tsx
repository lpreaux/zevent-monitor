import '../global.css';

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, type NativeStackHeaderProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';

import { AppHeader } from '@/components/app-header';
import { icons } from '@/lib/icons';
import { createQueryClient, setupAppStateFocus } from '@/lib/query-client';
import { colors } from '@/theme';
import { useNotificationRouting, useNotificationsSync } from '@/lib/use-notifications-sync';
import { useAccountSync } from '@/lib/use-account-sync';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

interface StackHeaderConfig {
  title: string;
  subtitle?: string;
  /** Écran présenté en feuille modale : il se ferme au lieu de revenir en arrière. */
  modal?: boolean;
}

/**
 * Barre du haut des écrans empilés, alignée sur celle des onglets. Le titre de
 * l'écran l'emporte quand il est défini dynamiquement (page d'un streamer).
 */
function stackHeader({ title, subtitle, modal = false }: StackHeaderConfig) {
  // Une feuille modale iOS démarre déjà sous l'encoche : y ajouter l'inset ferait double.
  const insetTop = !(modal && Platform.OS === 'ios');

  return function StackHeader({ navigation, back, options }: NativeStackHeaderProps) {
    const dynamicTitle = typeof options.headerTitle === 'string' ? options.headerTitle : undefined;
    return (
      <AppHeader
        compact
        title={dynamicTitle || title}
        subtitle={subtitle}
        backIcon={modal ? icons.close : icons.back}
        insetTop={insetTop}
        onBack={back ? () => navigation.goBack() : undefined}
      />
    );
  };
}

function AccountSync() {
  useAccountSync();
  return null;
}

function AppLayout({ accountsEnabled = true }: { accountsEnabled?: boolean }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => setupAppStateFocus(), []);
  useNotificationRouting();
  useNotificationsSync();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {accountsEnabled ? <AccountSync /> : null}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="account"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Mon compte', subtitle: 'Synchronisation multi-appareils' }),
            }}
          />
          {/* Connexion : écran immersif sans barre du haut, il porte sa propre fermeture. */}
          <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="always-on"
            options={{ animation: 'fade', contentStyle: { backgroundColor: '#000000' } }}
          />
          <Stack.Screen
            name="favorites"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Mes favoris', subtitle: 'Classés par pertinence' }),
            }}
          />
          <Stack.Screen
            name="settings/notifications"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Notifications', subtitle: 'Alertes du week-end' }),
            }}
          />
          <Stack.Screen
            name="share-card"
            options={{
              headerShown: true,
              presentation: 'modal',
              header: stackHeader({
                title: 'Partager la cagnotte',
                subtitle: 'Carte à publier',
                modal: true,
              }),
            }}
          />
          <Stack.Screen
            name="stats-share"
            options={{
              headerShown: true,
              presentation: 'modal',
              header: stackHeader({
                title: 'Partager la comparaison',
                subtitle: 'Carte à publier',
                modal: true,
              }),
            }}
          />
          <Stack.Screen
            name="streamer/[twitch]/index"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Streamer' }),
            }}
          />
          <Stack.Screen
            name="streamer/[twitch]/goals"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Paliers', subtitle: 'Donation goals du streamer' }),
            }}
          />
          <Stack.Screen
            name="streamer/[twitch]/share"
            options={{
              headerShown: true,
              presentation: 'modal',
              header: stackHeader({
                title: 'Partager la fiche',
                subtitle: 'Carte à publier',
                modal: true,
              }),
            }}
          />
          {/* Récap et ses réglages portent leur propre barre : l'un affiche le nom de la
              période chargée, l'autre revient à l'onglet. Une barre figée par le Stack ne
              saurait ni l'un ni l'autre. */}
          <Stack.Screen name="recap/[id]" />
          <Stack.Screen name="settings/recaps" />
        </Stack>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  if (!clerkPublishableKey) {
    return <AppLayout accountsEnabled={false} />;
  }
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <AppLayout />
    </ClerkProvider>
  );
}
