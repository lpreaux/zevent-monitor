import '../global.css';

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, type NativeStackHeaderProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { createQueryClient, setupAppStateFocus } from '@/lib/query-client';
import { colors } from '@/theme';
import { useNotificationRouting, useNotificationsSync } from '@/lib/use-notifications-sync';

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
        backIcon={modal ? 'close' : 'chevron-back'}
        insetTop={insetTop}
        onBack={back ? () => navigation.goBack() : undefined}
      />
    );
  };
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => setupAppStateFocus(), []);
  useNotificationRouting();
  useNotificationsSync();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="always-on"
            options={{ animation: 'fade', contentStyle: { backgroundColor: '#000000' } }}
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
            name="streamer/[twitch]"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Streamer' }),
            }}
          />
          <Stack.Screen
            name="recap/[id]"
            options={{
              headerShown: true,
              header: stackHeader({ title: 'Récapitulatif', subtitle: 'Résumé personnalisé' }),
            }}
          />
        </Stack>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
