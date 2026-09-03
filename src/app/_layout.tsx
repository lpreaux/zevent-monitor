import '../global.css';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient, setupAppStateFocus } from '@/lib/query-client';
import { useNotificationRouting, useNotificationsSync } from '@/lib/use-notifications-sync';

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
            contentStyle: { backgroundColor: '#030712' },
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
              headerStyle: { backgroundColor: '#111827' },
              headerTintColor: '#f9fafb',
              headerTitle: 'Notifications',
              headerBackTitle: 'Retour',
            }}
          />
          <Stack.Screen
            name="streamer/[twitch]"
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: '#111827' },
              headerTintColor: '#f9fafb',
              headerTitle: '',
              headerBackTitle: 'Retour',
            }}
          />
        </Stack>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
