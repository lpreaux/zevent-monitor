import { Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { AppHeader } from '@/components/app-header';
import { NavRow } from '@/components/nav-row';
import { ScreenShell } from '@/components/screen-shell';
import { SectionHeader } from '@/components/section-header';
import { icons } from '@/lib/icons';
import {
  DONATIONS_REFETCH_INTERVAL_MS,
  LIVE_REFETCH_INTERVAL_MS,
  PLANNING_REFETCH_INTERVAL_MS,
} from '@/lib/config';

const INGDOC_URL = 'https://zevent.gdoc.fr/';

/** Intervalle exprimé comme on le dirait à voix haute. */
function everyLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `toutes les ${seconds} s` : `toutes les ${Math.round(seconds / 60)} min`;
}

/** Une provenance : d'où viennent les chiffres, et à quelle cadence ils sont repris. */
function Source({ name, what, rate }: { name: string; what: string; rate: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-[13px] font-semibold text-gray-200">{name}</Text>
      <Text className="text-xs leading-5 text-gray-500">
        {what}
        <Text className="text-gray-600">{` — ${rate}`}</Text>
      </Text>
    </View>
  );
}

/**
 * Hub des réglages.
 *
 * Il n'existait pas : `settings/notifications` et `settings/recaps` étaient deux feuilles
 * atteignables depuis deux onglets différents, qui se renvoyaient l'une à l'autre faute
 * d'avoir un dessus commun, et le compte ne s'ouvrait que depuis l'Accueil. Chaque
 * en-tête de page pointe désormais ici, ce qui donne au bouton de réglages une
 * destination unique quel que soit l'écran d'où on l'appuie.
 *
 * Les provenances et la version y sont écrites à plat plutôt que derrière deux feuilles
 * de plus : ce sont trois paragraphes qu'on lit une fois, et une page qui ne contiendrait
 * qu'eux se compterait comme une navigation pour rien.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <ScreenShell header={<AppHeader compact title="Réglages" onBack={() => router.back()} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-7 p-5 pb-16">
        <View>
          <SectionHeader
            title="Alertes"
            hint="Ce que l’application vous envoie, et quand."
          />
          <NavRow
            icon={icons.notificationsOff}
            label="Notifications"
            hint="Paliers, favoris, dons marquants, plage silencieuse"
            onPress={() => router.push('/settings/notifications')}
          />
          <NavRow
            icon={icons.time}
            label="Récaps"
            hint="Horaires des récaps programmés"
            onPress={() => router.push('/settings/recaps' as never)}
          />
        </View>

        <View>
          <SectionHeader title="Affichage et compte" />
          <NavRow
            icon={icons.alwaysOn}
            label="Écran secondaire"
            hint="Affichage de loin, mode kiosque, gradation"
            onPress={() => router.push('/always-on')}
          />
          {process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
            <NavRow
              icon={icons.account}
              label="Mon compte"
              hint="Synchronisation des favoris entre appareils"
              onPress={() => router.push('/account' as never)}
            />
          ) : null}
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Sources et fraîcheur"
            hint="L’application ne produit aucun chiffre : elle relaie ceux-ci."
          />
          <Source
            name="zevent.fr"
            what="Cagnottes, audiences et liste des streamers"
            rate={everyLabel(LIVE_REFETCH_INTERVAL_MS)}
          />
          <Source
            name="Streamlabs Charity"
            what="Le fil des dons, tel qu’il passe — un plancher, jamais le compte réel"
            rate={everyLabel(DONATIONS_REFETCH_INTERVAL_MS)}
          />
          <Source
            name="InGDocs / EvenMoreStats"
            what="Planning des émissions et paliers des streamers"
            rate={everyLabel(PLANNING_REFETCH_INTERVAL_MS)}
          />
          <Text
            onPress={() => void Linking.openURL(INGDOC_URL)}
            accessibilityRole="link"
            className="text-[11px] text-zevent-300"
          >
            zevent.gdoc.fr
          </Text>
        </View>

        <View className="gap-2">
          <SectionHeader title="À propos" />
          <Text className="text-xs leading-5 text-gray-500">
            ZEvent Monitor {version} — application non officielle, sans lien avec
            l’organisation du ZEvent. Les dons se font sur zevent.fr, jamais ici.
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
