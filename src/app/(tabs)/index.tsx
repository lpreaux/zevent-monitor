import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useZeventState } from '@/api/queries';
import { AppHeader, type HeaderAction } from '@/components/app-header';
import { icons } from '@/lib/icons';
import { ScreenShell } from '@/components/screen-shell';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { FavoritesSection } from '@/components/favorites-section';
import { MomentumSection } from '@/components/momentum-section';
import { SectionBreak } from '@/components/section-break';
import { WebsiteModeBadge } from '@/components/website-mode-badge';

function readMarquee(marquee: unknown): string | null {
  if (typeof marquee === 'string') return marquee.trim() || null;
  if (marquee && typeof marquee === 'object') {
    const record = marquee as Record<string, unknown>;
    const text = record.text ?? record.message ?? record.label;
    if (typeof text === 'string') return text.trim() || null;
  }
  return null;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { data, isError, error, refetch, isRefetching } = useZeventState();

  // Le compte a quitté la barre du haut pour le socle : il vaut pour toute l'application,
  // pas pour l'Accueil, et l'en-tête d'une page ne porte plus qu'une action — la sienne.
  const headerActions = useMemo<HeaderAction[]>(
    () => [
      {
        icon: icons.settings,
        label: 'Réglages des notifications',
        onPress: () => router.push('/settings/notifications'),
      },
    ],
    [router],
  );

  const onRefresh = useCallback(() => void refetch(), [refetch]);

  if (!data) {
    return (
      <ScreenShell
        header={
          <AppHeader
            title="ZEvent Monitor"
            subtitle="Édition 2026"
            actions={headerActions}
          />
        }
      >
        {isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Backend injoignable'}
            onRetry={onRefresh}
          />
        ) : (
          <LoadingState label="Connexion au backend…" />
        )}
      </ScreenShell>
    );
  }

  const state = data.data;
  const marquee = readMarquee(state.marquee);

  return (
    <ScreenShell
      header={
        <AppHeader
          title="ZEvent Monitor"
          subtitle="Édition 2026"
          badge={<WebsiteModeBadge mode={state.websiteMode} />}
          actions={headerActions}
        />
      }
    >
      <ScrollView
        // Sections espacées franchement : c'est le vide entre elles, plus qu'un encadré,
        // qui découpe un accueil fait de listes.
        contentContainerClassName="gap-7 px-5 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
        {marquee ? (
          <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <Text className="text-sm text-amber-200">{marquee}</Text>
          </View>
        ) : null}

        <FavoritesSection />

        <SectionBreak />

        <MomentumSection />
      </ScrollView>
    </ScreenShell>
  );
}
