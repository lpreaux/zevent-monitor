import '../global.css';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient, setupAppStateFocus } from '@/lib/query-client';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => setupAppStateFocus(), []);

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
