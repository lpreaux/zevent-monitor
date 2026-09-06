import { useEffect, useState } from 'react';
import { Keyboard, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useZeventState } from '@/api/queries';
import { AnimatedEuros } from '@/components/animated-euros';
import { Metric, MetricDivider } from '@/components/metric';
import { NavRow } from '@/components/nav-row';
import { SocleNowLine, SoclePlanning } from '@/components/socle-planning';
import { TabRow } from '@/components/app-tab-bar';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { formatCount, formatRelativeTime } from '@/lib/format';
import { iconSizes, icons } from '@/lib/icons';
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
          valent pour tous les onglets, et la barre du haut ne parle que de sa page. Une
          seule entrée depuis que le hub existe — c'est lui qui range ce qu'il y a derrière. */}
      <View className="border-t border-white/5 pt-1">
        <NavRow
          icon={icons.settings}
          label="Réglages"
          hint="Notifications, récaps, écran secondaire, compte"
          onPress={() => go('/settings')}
        />
      </View>
    </View>
  );
}

/**
 * Hauteur et corps du montant, repliés puis dépliés.
 *
 * La hauteur est fixée plutôt que laissée au contenu : le compteur d'euros est un
 * `TextInput` — c'est ainsi qu'il défile sans repasser par React — et la hauteur
 * intrinsèque d'un champ de saisie ne se prédit pas d'une plateforme à l'autre. Le socle
 * est du mobilier : il ne doit pas changer de taille selon l'appareil.
 *
 * Le montant grandit au dépliage plutôt que d'être réécrit en grand dans le panneau. Le
 * mode confort de l'ancienne barre l'affichait deux fois, en petit dans la ligne et en
 * grand au-dessus, ce qui donnait deux chiffres à rapprocher là où il n'y en a qu'un à
 * lire. Ici c'est le même, qui prend la place que le dépliage lui offre.
 */
const LINE = {
  closed: { height: 36, amount: 16 },
  open: { height: 56, amount: 30 },
} as const;

/** Ligne permanente : la cagnotte, ce qui passe, et les deux gestes du week-end. */
function GlobalLine({ open, onOpenPlanning }: { open: boolean; onOpenPlanning: () => void }) {
  const router = useRouter();
  const { data } = useZeventState();
  const state = data?.data;
  const stale = data?.source.stale ?? false;
  const metrics = open ? LINE.open : LINE.closed;

  return (
    <View className="flex-row items-center gap-2 px-5" style={{ height: metrics.height }}>
      <FreshnessDot stale={stale} />
      {state ? (
        <AnimatedEuros value={state.donationAmount.number} style={{ fontSize: metrics.amount }} />
      ) : (
        <Text style={{ fontSize: metrics.amount }} className="font-extrabold text-white">
          {EM_DASH}
        </Text>
      )}
      {/* L'espace entre le montant et les boutons est réservé quoi qu'il arrive : le
          programme peut n'avoir rien à dire — hors week-end, ou planning injoignable —, et
          les boutons ne doivent pas venir se coller au chiffre pour autant.

          Déplié, il reste vide : le programme est alors juste au-dessus, en trois lignes
          lisibles, et le redire ici en abrégé ne servirait personne. */}
      <View className="flex-1 flex-row items-center">
        {open ? null : <SocleNowLine onOpen={onOpenPlanning} />}
      </View>
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
    // Le dépliage ne s'anime pas, et c'est le seul montage qui ne clignote pas.
    //
    // Le socle portait une transition de disposition sur sa propre racine. Or il est posé
    // par le navigateur, qui le mesure et lui réserve sa place : animer son cadre revenait
    // à faire glisser la surface et le filet pendant que les enfants — la ligne de la
    // cagnotte, ses deux boutons, la rangée d'onglets — étaient déjà rendus à leur
    // position finale par la disposition, qui, elle, ne s'anime pas. Ils se retrouvaient
    // donc, le temps de la transition, hors du fond qui les porte. C'est ce que l'usage a
    // vu clignoter, et cela ne se règle pas en accélérant l'animation : le cadre et son
    // contenu ne peuvent pas être d'accord tant que l'un des deux seulement s'anime.
    <View
      className="border-t border-white/5 bg-surface"
      style={{ paddingBottom: Math.max(props.insets.bottom, 10) }}
    >
      <Handle open={open} onPress={() => setOpen((value) => !value)} />
      {open ? <SoclePanel onDismiss={() => setOpen(false)} /> : null}
      <GlobalLine open={open} onOpenPlanning={() => setOpen(true)} />
      <TabRow {...props} />
    </View>
  );
}
