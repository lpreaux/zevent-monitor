import { useEffect, useState } from 'react';
import { Keyboard, Linking, Platform, Pressable, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useZeventState } from '@/api/queries';
import { AnimatedEuros } from '@/components/animated-euros';
import { Metric, MetricDivider } from '@/components/metric';
import { SoclePlanning } from '@/components/socle-planning';
import { TabRow } from '@/components/app-tab-bar';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { formatCount, formatRelativeTime } from '@/lib/format';
import { iconSizes, icons, type IconName } from '@/lib/icons';
import { colors } from '@/theme';

const EM_DASH = '—';

/** Pastille de fraîcheur : verte quand la source répond, ambre sur dernier état connu. */
function FreshnessDot({ stale }: { stale: boolean }) {
  return <View className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />;
}

/**
 * Poignée du socle.
 *
 * Elle a changé de sens en changeant de bord. En haut d'une barre accrochée sous le titre,
 * elle était à l'envers — on tirait vers le bas ce qui pendait déjà. Ici elle coiffe un
 * bloc posé au bas de l'écran, et « tirer vers le haut pour déplier » se devine sans
 * qu'on l'explique. La zone tactile court sur toute la largeur : c'est la commande la plus
 * fréquente du socle après le don, et elle doit se viser sans regarder.
 */
function Handle({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? 'Replier le détail du direct' : 'Déplier le détail du direct'}
      hitSlop={{ top: 8, bottom: 8 }}
      className="w-full flex-row items-center justify-center gap-1.5 pb-1 pt-2 active:opacity-60"
    >
      <View className="h-px w-8 rounded-full bg-white/15" />
      {/* Le chevron est à l'envers du lexique, et c'est voulu : `expand` y vaut
          chevron-bas parce qu'un bloc ancré en haut s'ouvre vers le bas. Celui-ci est
          ancré en bas et s'ouvre vers le haut, donc le chevron pointe vers le haut quand
          il y a à ouvrir, et vers le bas quand il y a à refermer. */}
      <Icon
        name={open ? icons.expand : icons.collapse}
        size={iconSizes.text}
        color={colors.inactive}
      />
      <View className="h-px w-8 rounded-full bg-white/15" />
    </Pressable>
  );
}

/** Entrée du menu d'application, logée dans le dépliage. */
function AppAction({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 py-2 active:opacity-60"
    >
      <Icon name={icon} size={iconSizes.button} color={colors.brandSoft} />
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-gray-200">{label}</Text>
        <Text numberOfLines={1} className="text-[11px] text-gray-500">
          {hint}
        </Text>
      </View>
      <Icon name={icons.forward} size={iconSizes.row} color={colors.inactive} />
    </Pressable>
  );
}

/**
 * Détail déplié : ce que la ligne permanente ne peut pas porter.
 *
 * Le grand montant du mode confort n'y est pas revenu. Il était le cœur de l'ancienne
 * barre parce qu'elle n'affichait rien quand on la réduisait ; ici la cagnotte est écrite
 * en permanence à trente pixels plus bas, et l'écrire deux fois dans le même bloc en
 * ferait deux chiffres à rapprocher plutôt qu'un seul à lire.
 */
function SoclePanel({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();
  const { data } = useZeventState();
  const state = data?.data;
  const stale = data?.source.stale ?? false;
  const liveCount = state ? state.live.filter((s) => s.online).length : 0;

  const go = (path: string) => {
    onDismiss();
    router.push(path as never);
  };

  return (
    <View className="gap-3 px-5 pb-3 pt-1">
      <View className="flex-row items-center gap-1.5">
        <FreshnessDot stale={stale} />
        <Text className="text-[11px] text-gray-500">
          {stale ? 'Dernier état connu' : 'À jour'} {formatRelativeTime(data?.source.fetchedAt)}
        </Text>
      </View>

      <View className="flex-row items-center">
        <Metric
          label="Viewers cumulés"
          value={state ? formatCount(state.viewersCount.number) : EM_DASH}
        />
        <MetricDivider />
        <Metric
          label="Streamers en live"
          value={state ? formatCount(liveCount) : EM_DASH}
          hint={state ? `sur ${formatCount(state.live.length)} inscrits` : undefined}
        />
      </View>

      <SoclePlanning onOpen={() => go('/(tabs)/planning')} />

      {/* Les commandes de l'application se prennent ici, pas dans la barre du haut : elles
          valent pour les six onglets, et la barre du haut ne parle que de sa page. */}
      <View className="border-t border-white/5 pt-1">
        {process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <AppAction
            icon={icons.account}
            label="Mon compte"
            hint="Synchronisation multi-appareils"
            onPress={() => go('/account')}
          />
        ) : null}
        <AppAction
          icon={icons.alwaysOn}
          label="Écran secondaire"
          hint="Affichage de loin, mode kiosque"
          onPress={() => go('/always-on')}
        />
        <AppAction
          icon={icons.notificationsOff}
          label="Notifications"
          hint="Alertes du week-end"
          onPress={() => go('/settings/notifications')}
        />
      </View>
    </View>
  );
}

/**
 * Hauteur de la ligne permanente. Fixée plutôt que laissée au contenu : le compteur
 * d'euros est un `TextInput` — c'est ainsi qu'il défile sans repasser par React — et la
 * hauteur intrinsèque d'un champ de saisie ne se prédit pas d'une plateforme à l'autre.
 * Le socle est du mobilier : il ne doit pas changer de taille selon l'appareil.
 */
const GLOBAL_LINE_HEIGHT = 36;

/** Ligne permanente : la cagnotte, ce qu'il y a autour, et les deux gestes du week-end. */
function GlobalLine() {
  const router = useRouter();
  const { data } = useZeventState();
  const state = data?.data;
  const stale = data?.source.stale ?? false;
  const liveCount = state ? state.live.filter((s) => s.online).length : 0;

  return (
    <View
      className="flex-row items-center gap-2 px-5"
      style={{ height: GLOBAL_LINE_HEIGHT }}
    >
      <FreshnessDot stale={stale} />
      {state ? (
        <AnimatedEuros value={state.donationAmount.number} style={{ fontSize: 16 }} />
      ) : (
        <Text className="text-base font-extrabold text-white">{EM_DASH}</Text>
      )}
      <Text numberOfLines={1} className="flex-1 text-[11px] text-gray-500">
        {state
          ? `${formatCount(state.viewersCount.number)} viewers · ${formatCount(liveCount)} en live`
          : 'Chargement…'}
      </Text>
      {/* Le don garde sa teinte pleine : l'action que l'application existe pour rendre
          possible ne peut pas se ranger au même gris que ses voisines. */}
      <IconButton
        size="sm"
        variant="accent"
        icon={icons.donate}
        label="Faire un don"
        disabled={!state}
        onPress={() => {
          if (state) void Linking.openURL(state.globalDonationUrl);
        }}
      />
      <IconButton
        size="sm"
        icon={icons.share}
        label="Partager la cagnotte"
        onPress={() => router.push('/share-card')}
      />
    </View>
  );
}

/**
 * Vrai tant que le clavier occupe l'écran. `will*` sur iOS pour partir en même temps que
 * lui, `did*` sur Android où les événements d'intention n'existent pas.
 */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setShown(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setShown(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return shown;
}

/**
 * Le socle : poignée, ligne globale et menu du bas sur une seule pièce de mobilier.
 *
 * Les informations globales vivaient jusqu'ici sous la barre du haut, ce qui faisait lire
 * l'écran local → global → local et repoussait la première ligne de liste vers 400 px du
 * haut. Elles descendent ici pour deux raisons qui vont dans le même sens : le haut de
 * l'écran redevient purement local — titre, contrôles, contenu, sans interruption —, et le
 * don, le partage et la poignée, qui sont les commandes les plus fréquentes de
 * l'application, passent enfin dans la zone du pouce.
 *
 * Les trois paliers d'affichage de l'ancienne barre (confort / réduit / masqué), le bouton
 * de densité et le magasin qui les mémorisait ont disparu avec elle : la ligne est d'une
 * hauteur fixe et ne coûte plus assez pour qu'on ait à choisir de la voir. Il ne reste
 * qu'un dépliage, ouvert le temps qu'on le consulte.
 *
 * Rendu comme `tabBar` du navigateur : c'est ce qui garantit qu'il n'existe qu'une fois,
 * et que la scène se met d'elle-même à la bonne hauteur au-dessus de lui.
 */
export function AppSocle(props: BottomTabBarProps) {
  const [open, setOpen] = useState(false);
  const keyboardShown = useKeyboardShown();

  // Le socle se retire avec le menu du bas : la recherche de l'onglet Streamers ouvre le
  // clavier, et un socle poussé par-dessus le contenu masquerait les résultats qu'on tape.
  if (keyboardShown) return null;

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      className="border-t border-white/5 bg-surface"
      style={{ paddingBottom: Math.max(props.insets.bottom, 10) }}
    >
      <Handle open={open} onPress={() => setOpen((value) => !value)} />
      {open ? <SoclePanel onDismiss={() => setOpen(false)} /> : null}
      <GlobalLine />
      <TabRow {...props} />
    </Animated.View>
  );
}
