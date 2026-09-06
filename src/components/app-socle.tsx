import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Linking, Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
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
 * Durée du dépliage. Assez courte pour ne pas retenir, assez longue pour qu'on voie que
 * le chiffre grandit plutôt qu'il ne saute.
 */
const OPEN_MS = 220;

/**
 * Hauteur de la ligne et corps du montant, repliés puis dépliés.
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
  open: { height: 48, amount: 26 },
} as const;

/**
 * Hauteur de la rangée elle-même, invariable et calée au bas de la ligne.
 *
 * C'est ce qui rend les boutons fixes au sens propre : la ligne grandit au-dessus d'eux
 * et non autour d'eux. Centrés dans une ligne dont la hauteur varie, ils auraient
 * coulissé d'une dizaine de pixels à chaque dépliage — un mouvement qu'aucune des deux
 * commandes ne justifie, et qui aurait fait bouger la cible sous le pouce au moment même
 * où l'on cherche à la viser.
 *
 * Le corps déplié du montant est choisi pour tenir dedans : à 26 px, sa boîte de texte
 * reste sous les 36, et le chiffre grandit sans venir mordre sur la rangée d'onglets.
 */
const ROW_HEIGHT = 36;

/** Distance dont le programme s'écarte par la droite en s'effaçant. */
const NOW_SLIDE_PX = 24;

/**
 * Ligne permanente : la cagnotte, ce qui passe, et les deux gestes du week-end.
 *
 * Rien n'y apparaît ni n'en disparaît, à une exception près. La pastille de fraîcheur, le
 * montant et les deux boutons sont montés une fois pour toutes et le restent : ce sont
 * eux qui clignotaient, et un élément qu'on ne démonte jamais ne peut pas clignoter. Seul
 * le programme s'efface, en fondu et en glissant par la droite — lui a une raison de
 * partir, puisque le dépliage l'affiche en trois lignes juste au-dessus.
 *
 * Il s'efface sans être démonté non plus : sa place reste tenue par le conteneur
 * extensible, ce qui évite aux boutons de coulisser latéralement quand il s'en va.
 */
function GlobalLine({
  open,
  progress,
  onOpenPlanning,
}: {
  /** État d'arrivée : ce qui ne s'anime pas s'en déduit — appui, lecteur d'écran. */
  open: boolean;
  progress: SharedValue<number>;
  onOpenPlanning: () => void;
}) {
  const router = useRouter();
  const { data } = useZeventState();
  const state = data?.data;
  const stale = data?.source.stale ?? false;

  const lineStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [LINE.closed.height, LINE.open.height]),
  }));
  const amountStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(progress.value, [0, 1], [LINE.closed.amount, LINE.open.amount]),
  }));
  const nowStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateX: progress.value * NOW_SLIDE_PX }],
  }));

  return (
    <Animated.View className="justify-end px-5" style={lineStyle}>
      <View className="flex-row items-center gap-2" style={{ height: ROW_HEIGHT }}>
        <FreshnessDot stale={stale} />
        {state ? (
          <AnimatedEuros value={state.donationAmount.number} style={amountStyle} />
        ) : (
          <Animated.Text style={amountStyle} className="font-extrabold text-white">
            {EM_DASH}
          </Animated.Text>
        )}
        {/* L'espace entre le montant et les boutons est réservé quoi qu'il arrive : le
            programme peut n'avoir rien à dire — hors week-end, ou planning injoignable —,
            et les boutons ne doivent pas venir se coller au chiffre pour autant. */}
        {/* Effacé, il reste monté : sa zone ne doit donc plus ni répondre à l'appui ni
            être annoncée, sans quoi on ouvrirait le planning en visant du vide. */}
        <Animated.View
          className="flex-1 flex-row items-center"
          style={nowStyle}
          pointerEvents={open ? 'none' : 'auto'}
          accessibilityElementsHidden={open}
          importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
        >
          <SocleNowLine onOpen={onOpenPlanning} />
        </Animated.View>
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
    </Animated.View>
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
 * Tiroir du dépliage : une hauteur animée devant un contenu qui, lui, ne bouge pas.
 *
 * Le contenu reste monté et mesuré en permanence — c'est le cadre qui passe de zéro à sa
 * hauteur et le recouvre. Rien n'y est donc monté ni démonté au dépliage, ce qui écarte
 * d'un coup les animations d'entrée et de sortie et les demi-images qu'elles laissent.
 *
 * La hauteur est animée comme une vraie propriété de disposition, et c'est là toute la
 * différence avec ce qui clignotait : la disposition est recalculée à chaque image, si
 * bien que la surface du socle, son filet, ses boutons et la rangée d'onglets bougent
 * ensemble. Une transition de disposition posée sur la racine, elle, déplaçait le cadre
 * pendant que son contenu restait là où la disposition l'avait mis.
 */
function SocleSheet({ open, children }: { open: boolean; children: ReactNode }) {
  const [height, setHeight] = useState(0);

  const style = useAnimatedStyle(
    () => ({ height: withTiming(open ? height : 0, { duration: OPEN_MS }) }),
    [open, height],
  );

  return (
    <Animated.View style={style} className="overflow-hidden">
      <View
        // `flexShrink: 0` : sans lui, le conteneur écrasé à zéro écraserait son contenu
        // avec lui, et la mesure ne rendrait plus que des zéros.
        style={{ flexShrink: 0 }}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        // Replié, le panneau n'est plus qu'un contenu masqué : il ne doit ni recevoir
        // d'appui ni être annoncé par un lecteur d'écran.
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        {children}
      </View>
    </Animated.View>
  );
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

  // Une seule horloge pour tout ce qui s'anime dans la ligne : la hauteur, le corps du
  // chiffre et l'effacement du programme partent et arrivent ensemble, ce qu'ils ne
  // feraient pas s'ils comptaient chacun le leur.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: OPEN_MS });
  }, [open, progress]);

  // Le socle se retire avec le menu du bas : la recherche de l'onglet Streamers ouvre le
  // clavier, et un socle poussé par-dessus le contenu masquerait les résultats qu'on tape.
  if (keyboardShown) return null;

  return (
    // La racine, elle, ne s'anime pas. Elle portait une transition de disposition, et le
    // socle est posé par le navigateur, qui le mesure et lui réserve sa place : animer son
    // cadre faisait glisser la surface et le filet pendant que les enfants — la ligne de la
    // cagnotte, ses deux boutons, la rangée d'onglets — restaient là où la disposition les
    // avait mis, puisqu'elle ne s'anime pas. Le temps de la transition, ils se retrouvaient
    // hors du fond qui les porte. Tout ce qui s'anime ici s'anime donc en dessous, sur des
    // propriétés que la disposition recalcule.
    <View
      className="border-t border-white/5 bg-surface"
      style={{ paddingBottom: Math.max(props.insets.bottom, 10) }}
    >
      <Handle open={open} onPress={() => setOpen((value) => !value)} />
      <SocleSheet open={open}>
        <SoclePanel onDismiss={() => setOpen(false)} />
      </SocleSheet>
      <GlobalLine open={open} progress={progress} onOpenPlanning={() => setOpen(true)} />
      <TabRow {...props} />
    </View>
  );
}
