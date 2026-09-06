import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { usePlanning, useZeventState } from '@/api/queries';
import { AppHeader } from '@/components/app-header';
import { DisclosureButton } from '@/components/disclosure-button';
import { ListControls, useFloatingControls } from '@/components/list-controls';
import { PlanningFocusCard } from '@/components/planning-focus-card';
import { PlanningNowMarker } from '@/components/planning-now-marker';
import { PlanningRow } from '@/components/planning-row';
import { ScreenShell } from '@/components/screen-shell';
import { EmptyState, LoadingState } from '@/components/screen-state';
import { SectionTitle } from '@/components/section-title';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import { icons } from '@/lib/icons';
import { buildPlanningView, type PlanningItem } from '@/lib/planning-view';
import { REMINDER_LEAD_MS } from '@/lib/planning-reminders';
import { useNow } from '@/lib/use-now';
import { useFavoritesStore } from '@/store/favorites';
import { usePlanningRemindersStore } from '@/store/planning-reminders';

/** Le planning vient des InGDocs : on le crédite et on garde un lien vers leur site. */
const INGDOC_URL = 'https://zevent.gdoc.fr/';

/** Un créneau bascule à la minute, jamais à la seconde : les cartes affinent seules. */
const TICK_MS = 30_000;

/**
 * Directs montrés en tête avant dépliage. Chaque carte occupe un bon tiers de hauteur :
 * toutes les afficher d'office — le ZEvent en aligne couramment cinq ou six en parallèle —
 * repousserait le programme à deux écrans de défilement. Le compte des autres est annoncé
 * juste en dessous, et un appui les déplie.
 */
const LIVE_CARDS = 2;

/** Émissions à venir mises en tête, selon qu'il y a déjà des directs à montrer ou non. */
const NEXT_CARDS_ALONE = 2;
const NEXT_CARDS_WITH_LIVE = 1;

/** Respiration entre la barre de commandes flottante et la première carte. */
const CONTENT_GAP = 8;

/** Délai laissé au fil pour se reconstruire avant de mesurer le repère. */
const SETTLE_MS = 260;

/**
 * Le rail de journées borne le fil au lieu d'y sauter.
 *
 * Un saut aurait demandé de connaître d'avance la hauteur de tout ce qu'on survole, ce
 * qu'une liste d'émissions dépliables ne peut pas promettre : `scrollToLocation` visait
 * alors au jugé et retombait à côté. Borner ne coûte rien à la lecture — les cartes de
 * tête, elles, restent hors du filtre — et répond plus directement à la question qu'on se
 * pose devant un rail de jours : « qu'est-ce qu'il y a dimanche ? »
 */
const ALL_DAYS = 'all';
type DayFilter = typeof ALL_DAYS | string;

export default function PlanningScreen() {
  const planning = usePlanning();
  const state = useZeventState();
  const now = useNow(TICK_MS);
  const controls = useFloatingControls();

  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [day, setDay] = useState<DayFilter>(ALL_DAYS);
  /** Le fil est-il posé sur le présent ? Voir `refreshPresence`. */
  const [atPresent, setAtPresent] = useState(true);
  /** Tous les directs dépliés en tête, plutôt que les deux premiers. */
  const [showAllLive, setShowAllLive] = useState(false);

  const favorites = useFavoritesStore((s) => s.favorites);
  const reminderError = usePlanningRemindersStore((s) => s.error);
  const dismissReminderError = usePlanningRemindersStore((s) => s.dismissError);
  const syncReminders = usePlanningRemindersStore((s) => s.sync);

  const listRef = useRef<SectionList<PlanningItem>>(null);
  /** Vue englobante, repère du présent et tête du fil : ce que l'on sait mesurer pour s'y rendre. */
  const frameRef = useRef<View>(null);
  const markerRef = useRef<View>(null);
  const programRef = useRef<View>(null);
  /** Défilement courant et hauteur du cadre, tenus à jour au fil des événements. */
  const scrollY = useRef(0);
  const frameHeight = useRef(0);
  /**
   * Position du repère du présent dans le contenu, relevée quand il est monté. `null`
   * tant qu'on ne l'a jamais vu : le fil peut être long, et rien n'oblige la liste à
   * rendre d'emblée un élément qu'on n'a pas approché.
   */
  const markerOffset = useRef<number | null>(null);
  /** Retour au présent demandé, à honorer dès que le repère est de nouveau dans le fil. */
  const seekNow = useRef(false);

  // Les rappels sont programmés dans le système et survivent à l'application : quand le
  // planning communautaire bouge, c'est ici qu'ils sont réalignés sur les nouveaux horaires.
  useEffect(() => {
    if (planning.entries.length > 0) void syncReminders(planning.entries, Date.now());
  }, [planning.entries, syncReminders]);

  const knownStreamers = useMemo(
    () => new Set((state.data?.data.live ?? []).map((streamer) => streamer.twitch.toLowerCase())),
    [state.data],
  );

  const view = useMemo(
    () =>
      buildPlanningView(planning.entries, now, {
        favorites,
        favoritesOnly,
        day: day === ALL_DAYS ? null : day,
      }),
    [planning.entries, now, favorites, favoritesOnly, day],
  );

  /**
   * Cartes de tête : ce qui passe d'abord, puis ce qui suit. Une émission à venir garde
   * toujours sa place — même quand six directs se chevauchent, la question « et après ? »
   * reste posée.
   */
  const focus = useMemo(() => {
    const live = showAllLive ? view.live : view.live.slice(0, LIVE_CARDS);
    const nextCount = live.length > 0 ? NEXT_CARDS_WITH_LIVE : NEXT_CARDS_ALONE;
    return {
      cards: [...live, ...view.next.slice(0, nextCount)],
      /** Directs en cours que les cartes ne montrent pas. */
      hiddenLive: view.live.length - live.length,
    };
  }, [view.live, view.next, showAllLive]);

  // Le filtre garde sa valeur même si la journée disparaît du planning : c'est un choix
  // de l'utilisateur, pas un état dérivé des données.
  const dayOptions = useMemo(
    () => [
      { key: ALL_DAYS, label: 'Tout' },
      ...view.days.map((item) => ({ key: item.key, label: item.short })),
    ],
    [view.days],
  );

  /**
   * Le fil est « au présent » quand le repère est à portée de vue : dans le cadre, ou à
   * moins d'un écran de part et d'autre.
   *
   * La marge est ce qui compte. Les émissions en cours se rangent juste au-dessus du
   * repère, celles à venir juste en dessous : dans les deux cas on regarde bien le
   * présent, et un bouton qui propose d'y revenir n'a alors rien à dire. Exiger que le
   * repère lui-même soit à l'écran le laissait allumé précisément quand on lisait ce qui
   * passe.
   *
   * Tant que le repère n'a jamais été mesuré, on s'en remet au défilement : en tête de
   * fil on est au présent, plus loin on ne l'est plus.
   */
  const refreshPresence = useCallback(() => {
    const height = frameHeight.current || 1;
    // En tête de fil, ce sont les cartes du moment qui occupent l'écran : on ne peut pas
    // être plus près du présent, et le repère du fil a beau être loin, il n'y a rien à
    // proposer. Cela vaut aussi tant que le repère n'a jamais été mesuré.
    if (scrollY.current < height) {
      setAtPresent(true);
      return;
    }
    const offset = markerOffset.current;
    if (offset === null) {
      setAtPresent(false);
      return;
    }
    const distance = offset - scrollY.current;
    setAtPresent(distance > -height && distance < height);
  }, []);

  /** Relève la position du repère dans le contenu. Sans effet s'il n'est pas monté. */
  const measureMarker = useCallback(() => {
    const marker = markerRef.current;
    const frame = frameRef.current;
    if (!marker || !frame) return;
    frame.measureInWindow((_, frameY) => {
      marker.measureInWindow((__, markerY) => {
        markerOffset.current = scrollY.current + (markerY - frameY);
        refreshPresence();
      });
    });
  }, [refreshPresence]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;
      refreshPresence();
      controls.onScroll(event);
    },
    [controls, refreshPresence],
  );

  /**
   * Amène une vue du contenu juste sous la barre de commandes.
   *
   * On mesure au lieu de demander à la liste de s'y rendre : `scrollToLocation` ne sait
   * viser que sur les hauteurs déjà relevées, et sur des lignes qui se déplient celles
   * qu'on n'a pas traversées ne le sont pas — le saut s'arrêtait invariablement au dernier
   * élément mesuré, à mi-chemin. Deux mesures d'écran et le défilement courant donnent la
   * position exacte, quelle que soit la virtualisation.
   */
  const scrollToView = useCallback(
    (target: React.RefObject<View | null>) => {
      const node = target.current;
      const frame = frameRef.current;
      const scroller = listRef.current?.getScrollResponder();
      if (!node || !frame || !scroller) return false;

      const run = () => {
        frame.measureInWindow((_, frameY) => {
          node.measureInWindow((__, nodeY) => {
            const y = scrollY.current + (nodeY - frameY) - controls.paddingTop - CONTENT_GAP;
            scroller.scrollTo({ y: Math.max(y, 0), animated: true });
          });
        });
      };

      // Deux passes : la liste rend et mesure encore pendant la première, et la borne
      // qu'elle applique alors au défilement laisse la course inachevée. La seconde repart
      // de la position atteinte et retombe juste.
      run();
      setTimeout(run, SETTLE_MS);
      return true;
    },
    [controls.paddingTop],
  );

  const goToDay = useCallback(
    (key: DayFilter) => {
      setDay(key);
      // Le fil change entièrement : le montrer depuis son début. On vise la tête du
      // programme, pas celle de l'écran — les cartes du moment, qu'aucun filtre de journée
      // ne concerne, n'ont pas à repasser sous les yeux à chaque changement de jour.
      scrollToView(programRef);
    },
    [scrollToView],
  );

  /**
   * Retour au présent. Si le fil est borné à une autre journée, le repère n'y figure pas :
   * on rétablit d'abord la journée en cours, et l'effet ci-dessous fait le déplacement une
   * fois le fil reconstruit et le repère monté.
   */
  const goToNow = useCallback(() => {
    if (scrollToView(markerRef)) return;
    seekNow.current = true;
    setDay(view.todayKey);
  }, [scrollToView, view.todayKey]);

  // Le fil vient d'être rebâti sur la journée en cours : le repère va être monté, et
  // mesurable à la foulée suivante. Le drapeau vit dans une référence — ce n'est pas un
  // état dont dépend le rendu, seulement une intention en attente.
  useEffect(() => {
    if (!seekNow.current || !view.nowLocation) return;
    seekNow.current = false;
    const timer = setTimeout(() => scrollToView(markerRef), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [view.nowLocation, scrollToView]);

  // Le fil vient de changer de contenu : la position du repère avec lui.
  useEffect(() => {
    const timer = setTimeout(measureMarker, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [day, favoritesOnly, showAllLive, measureMarker]);

  const header = <AppHeader title="Planning" subtitle="Horaires en heure de Paris" />;

  if (planning.isLoading && planning.entries.length === 0) {
    return (
      <ScreenShell header={header}>
        <LoadingState label="Chargement du planning…" />
      </ScreenShell>
    );
  }

  // Sans journée en cours au planning, il n'y a nulle part où revenir ; sans repère dans
  // le fil affiché — une autre journée est filtrée — on en est forcément loin.
  const showBackToNow =
    view.days.some((item) => item.key === view.todayKey) && (!view.nowLocation || !atPresent);

  // Le fil ne montre plus forcément tout le week-end : le résumé dit sur quoi il porte.
  const scope =
    day === ALL_DAYS
      ? 'sur le week-end'
      : `le ${view.days.find((item) => item.key === day)?.label ?? 'jour choisi'}`;
  const summary =
    view.counts.live > 0
      ? `${formatCount(view.counts.live)} à l’antenne · ${formatCount(view.counts.shown)} émissions ${scope}`
      : `${formatCount(view.counts.shown)} émissions ${scope}`;

  return (
    <ScreenShell header={header}>
      <View
        ref={frameRef}
        onLayout={(event) => {
          frameHeight.current = event.nativeEvent.layout.height;
        }}
        className="flex-1"
      >
        <SectionList
          ref={listRef}
          sections={view.sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: controls.paddingTop + CONTENT_GAP,
            paddingHorizontal: 20,
            paddingBottom: 40,
          }}
          // Les intitulés de journée iraient se coller sous la barre flottante, donc hors
          // de vue.
          stickySectionHeadersEnabled={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Le défilement s'arrête : c'est le bon moment pour relever à nouveau la
          // position du repère, que le dépliage d'une ligne au-dessus a pu décaler.
          onMomentumScrollEnd={measureMarker}
          onScrollEndDrag={measureMarker}
          // Une journée tient en une quinzaine d'émissions : tout rendre d'emblée est ce
          // qui rend le retour au repère du présent fiable, faute de hauteurs connues à
          // l'avance sur des lignes qui se déplient.
          initialNumToRender={40}
          refreshControl={
            <RefreshControl
              refreshing={planning.isRefetching}
              onRefresh={planning.refetch}
              tintColor="#a78bfa"
              progressViewOffset={controls.paddingTop}
            />
          }
          ListHeaderComponent={
            <View className="gap-3 pb-2">
              {reminderError ? (
                <Pressable
                  onPress={dismissReminderError}
                  accessibilityRole="button"
                  accessibilityLabel="Masquer l’avertissement"
                  className="flex-row items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 active:opacity-70"
                >
                  <Ionicons name="notifications-off-outline" size={14} color="#fcd34d" />
                  <Text className="flex-1 text-xs text-amber-200">{reminderError}</Text>
                </Pressable>
              ) : null}

              {focus.cards.length > 0 ? (
                <View className="gap-2.5">
                  {focus.cards.map((item) => (
                    <PlanningFocusCard key={item.id} item={item} now={now} />
                  ))}

                  {/* Ce que la tête d'écran ne montre pas doit au moins se compter : sans
                      cette ligne, « 4 à l'antenne » dans le résumé contredisait les deux
                      cartes visibles. */}
                  {view.live.length > LIVE_CARDS ? (
                    <DisclosureButton
                      expanded={showAllLive}
                      onPress={() => setShowAllLive((value) => !value)}
                      label={`${formatCount(focus.hiddenLive)} autre${focus.hiddenLive > 1 ? 's' : ''} à l’antenne`}
                      expandedLabel="Réduire les émissions en cours"
                    />
                  ) : null}
                </View>
              ) : view.sections.length > 0 ? (
                <View className="rounded-3xl border border-white/10 bg-surface-raised px-4 py-5">
                  <Text className="text-sm text-gray-400">
                    {favoritesOnly
                      ? 'Aucune émission à venir avec vos favoris — le programme complet reste dessous.'
                      : 'Plus rien de programmé : le week-end est terminé.'}
                  </Text>
                </View>
              ) : null}

              {view.sections.length > 0 ? (
                <View ref={programRef} className="flex-row items-baseline justify-between pt-1">
                  <SectionTitle label="Tout le programme" count={view.counts.shown} />
                  <Text className="text-[11px] text-gray-600">appuyer pour déplier</Text>
                </View>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-center gap-2 pb-1 pt-4">
              <Text className="text-[13px] font-bold text-gray-300">
                {/* Une capitale à l'initiale seulement : `capitalize` en mettrait une à
                    chaque mot, et « Jeudi 3 Septembre » n'est pas du français. */}
                {section.label.charAt(0).toUpperCase() + section.label.slice(1)}
              </Text>
              <View className="h-px flex-1 bg-white/[0.06]" />
            </View>
          )}
          renderItem={({ item }) =>
            item.kind === 'now' ? (
              <PlanningNowMarker ref={markerRef} now={now} onLayout={measureMarker} />
            ) : (
              <PlanningRow item={item} now={now} knownStreamers={knownStreamers} />
            )
          }
          ListEmptyComponent={
            <EmptyState
              message={
                favoritesOnly
                  ? 'Aucune émission n’annonce ici un streamer que vous suivez.'
                  : 'Aucun événement au planning pour l’instant.'
              }
            />
          }
          ListFooterComponent={
            <Pressable
              onPress={() => void Linking.openURL(INGDOC_URL)}
              accessibilityRole="link"
              className="mt-6 items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 active:opacity-70"
            >
              <Text className="text-xs text-gray-400">
                Planning compilé par les InGDocs — voir zevent.gdoc.fr
              </Text>
            </Pressable>
          }
        />

        {/* Posée par-dessus, hors du flux : son repli ne redimensionne donc pas la liste.
            Voir `ListControls` pour ce que coûte une barre qui vit dans le flux. */}
        <View className="absolute left-0 right-0 top-0">
          <ListControls
            sorts={dayOptions}
            sort={day}
            onSortChange={goToDay}
            toggle={{
              active: favoritesOnly,
              onPress: () => setFavoritesOnly((value) => !value),
              icon: 'star-outline',
              activeIcon: 'star',
              label: 'N’afficher que les émissions de mes favoris',
            }}
            summary={summary}
            freshness={{ fetchedAt: planning.fetchedAt, stale: planning.stale }}
            hint={`Planning communautaire, susceptible de changer en direct. Les rappels préviennent ${REMINDER_LEAD_MS / 60_000} min avant le début.`}
            note={
              planning.origin === 'bundled'
                ? 'Planning embarqué dans l’application : le backend n’a pas encore fourni de version à jour.'
                : view.counts.withFavorites > 0 && !favoritesOnly
                  ? `${formatCount(view.counts.withFavorites)} émissions annoncent un streamer que vous suivez.`
                  : undefined
            }
            compact={controls.compact}
            onHeights={controls.onHeights}
          />
        </View>

        {/* Une fois qu'on s'est éloigné du présent — par le défilement ou en allant voir
            une autre journée —, y revenir doit tenir en un geste. Le bouton ne s'affiche
            que si la journée en cours figure au planning : sinon il n'y a nulle part où
            revenir. */}
        {showBackToNow ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            // Posé en style plutôt qu'en classes : NativeWind ne les applique pas
            // toujours à une vue animée, et sans ce placement le bouton s'étirait sur
            // toute la largeur de l'écran. Même raison que le fond de `ListControls`.
            style={{ position: 'absolute', bottom: 20, right: 20, alignItems: 'flex-end' }}
          >
            {/* Il partage son ancre avec le « Nouveau récap » de l'onglet voisin, qui est
                violet parce qu'il crée quelque chose. Celui-ci ne crée rien : il replace
                le fil où il était. Son rouge d'origine le faisait passer pour une alerte
                autant que pour une action de premier rang — le direct, l'écart négatif et
                l'erreur sont les seuls emplois de cette teinte (voir `lib/tone`). */}
            <Button
              size="sm"
              variant="overlay"
              icon={icons.time}
              label="Maintenant"
              accessibilityLabel="Revenir à maintenant"
              onPress={goToNow}
            />
          </Animated.View>
        ) : null}
      </View>
    </ScreenShell>
  );
}
