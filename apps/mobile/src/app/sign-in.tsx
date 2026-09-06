import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useAuth, useSSO } from '@clerk/expo';
import type { OAuthStrategy } from '@clerk/expo/types';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';

import { LoadingState } from '@/components/screen-state';
import { IconButton } from '@/components/ui/icon-button';
import { icons } from '@/lib/icons';
import { colors } from '@/theme';

WebBrowser.maybeCompleteAuthSession();

type IconName = keyof typeof Ionicons.glyphMap;
type Method = OAuthStrategy | 'email';

const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'zevent-monitor', path: 'sign-in' });

const providers: {
  strategy: OAuthStrategy;
  label: string;
  icon: IconName;
  tone: 'brand' | 'light';
}[] = [
  { strategy: 'oauth_twitch', label: 'Continuer avec Twitch', icon: 'logo-twitch', tone: 'brand' },
  { strategy: 'oauth_google', label: 'Continuer avec Google', icon: 'logo-google', tone: 'light' },
];

const benefits: { icon: IconName; title: string; description: string }[] = [
  {
    icon: 'heart',
    title: 'Vos favoris vous suivent',
    description: 'Les streamers suivis se retrouvent sur chaque appareil connecté.',
  },
  {
    icon: 'options',
    title: 'Un seul jeu de réglages',
    description: 'Seuils de dons, paliers et plage silencieuse restent identiques partout.',
  },
  {
    icon: 'phone-portrait',
    title: 'Notifications par appareil',
    description: 'Chaque téléphone garde son propre choix d’alertes push.',
  },
];

/** Halo violet en fond : donne de la profondeur sans encadrer le contenu. */
function Aurora() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="aurora-top" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
            <Stop offset="0.5" stopColor="#7c3aed" stopOpacity="0.16" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="aurora-bottom" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#d946ef" stopOpacity="0.22" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="22%" cy="4%" rx="88%" ry="32%" fill="url(#aurora-top)" />
        <Ellipse cx="96%" cy="78%" rx="72%" ry="28%" fill="url(#aurora-bottom)" />
      </Svg>
    </View>
  );
}

interface AuthButtonProps {
  icon: IconName;
  label: string;
  tone: 'brand' | 'light' | 'ghost';
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

function AuthButton({ icon, label, tone, loading, disabled, onPress }: AuthButtonProps) {
  const surface = {
    brand: 'bg-zevent-500',
    light: 'bg-white',
    ghost: 'border border-white/10 bg-white/5',
  }[tone];
  const foreground = tone === 'light' ? '#111827' : '#ffffff';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-14 flex-row items-center justify-center gap-3 rounded-2xl active:opacity-80 ${surface} ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Ionicons name={icon} size={20} color={foreground} />
      )}
      <Text className={`text-base font-bold ${tone === 'light' ? 'text-gray-900' : 'text-white'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function SignInContent() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { startSSOFlow } = useSSO();
  const { startHostedAuth } = useHostedAuth();
  const [pending, setPending] = useState<Method | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  }, [router]);

  const connect = async (strategy: OAuthStrategy) => {
    setPending(strategy);
    setAuthError(null);
    try {
      const result = await startSSOFlow({ strategy, redirectUrl });
      if (result.createdSessionId) {
        await result.setActive?.({ session: result.createdSessionId });
      } else {
        setAuthError('La connexion demande une étape supplémentaire non terminée.');
      }
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Connexion impossible');
    } finally {
      setPending(null);
    }
  };

  const connectWithEmail = async () => {
    setPending('email');
    setAuthError(null);
    try {
      const result = await startHostedAuth({ mode: 'sign-in', redirectUrl });
      if (!result.createdSessionId && result.authSessionResult?.type !== 'cancel') {
        setAuthError('La connexion par email n’a pas pu être terminée.');
      }
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Connexion par email impossible');
    } finally {
      setPending(null);
    }
  };

  if (!isLoaded) return <LoadingState label="Ouverture de la session…" />;
  // La session peut s'ouvrir pendant que l'écran est affiché : on rend la main au profil.
  if (isSignedIn) return <Redirect href="/account" />;

  const busy = pending !== null;

  return (
    <View className="flex-1 bg-gray-950">
      <Aurora />
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row px-4 pt-1">
          <IconButton variant="soft" icon={icons.close} label="Fermer" onPress={dismiss} />
        </View>

        {/*
          Le contenu tient sur un écran courant : le défilement n'est là que pour
          les petits écrans et les grandes tailles de police, d'où le rebond coupé.
        */}
        <ScrollView
          contentContainerClassName="grow justify-center gap-8 px-6 pb-4 pt-4"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          <View className="gap-3">
            <Text className="text-xs font-semibold uppercase tracking-[3px] text-zevent-300">
              ZEvent Monitor
            </Text>
            <Text className="text-[34px] font-extrabold leading-[40px] text-white">
              Vos favoris,{'\n'}sur tous vos écrans.
            </Text>
            <Text className="text-[15px] leading-6 text-gray-400">
              Un compte relie vos appareils entre eux. La connexion reste facultative : sans compte,
              tout est conservé sur ce téléphone.
            </Text>
          </View>

          <View className="gap-4">
            {benefits.map((benefit) => (
              <View key={benefit.title} className="flex-row items-start gap-4">
                <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-zevent-500/15">
                  <Ionicons name={benefit.icon} size={17} color={colors.brandSoft} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-gray-100">{benefit.title}</Text>
                  <Text className="mt-1 text-[13px] leading-5 text-gray-500">
                    {benefit.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="gap-3">
            {providers.map((provider) => (
              <AuthButton
                key={provider.strategy}
                icon={provider.icon}
                label={provider.label}
                tone={provider.tone}
                loading={pending === provider.strategy}
                disabled={busy}
                onPress={() => void connect(provider.strategy)}
              />
            ))}

            <View className="my-1 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-white/10" />
              <Text className="text-[11px] uppercase tracking-widest text-gray-600">ou</Text>
              <View className="h-px flex-1 bg-white/10" />
            </View>

            <AuthButton
              icon="mail-outline"
              label="Continuer par email"
              tone="ghost"
              loading={pending === 'email'}
              disabled={busy}
              onPress={() => void connectWithEmail()}
            />

            {authError ? (
              <View className="flex-row items-start gap-2 px-1">
                <Ionicons name="alert-circle" size={15} color="#fca5a5" />
                <Text className="flex-1 text-[13px] leading-5 text-red-300">{authError}</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={dismiss}
            disabled={busy}
            accessibilityRole="button"
            className="items-center py-1 active:opacity-60"
          >
            <Text className="text-sm font-semibold text-gray-500">Continuer sans compte</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default function SignInScreen() {
  // Sans clé Clerk, la synchronisation n'existe pas : l'écran n'a rien à proposer.
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <Redirect href="/(tabs)" />;
  }
  return <SignInContent />;
}
