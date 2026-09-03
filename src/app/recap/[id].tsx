import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { getRecap } from '@/api/recaps';
import { useRecapIdentity } from '@/lib/use-recap-identity';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View className="gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4"><Text className="text-lg font-bold text-white">{title}</Text>{children}</View>; }

export default function RecapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recapId = id ?? '';
  const { identity, error: identityError } = useRecapIdentity();
  const query = useQuery({ queryKey: ['recap', recapId, identity?.installationId], queryFn: () => getRecap(identity!, recapId), enabled: Boolean(identity) && /^\d+$/.test(recapId) });
  const recap = query.data;
  if (!recap) return <View className="flex-1 items-center justify-center bg-gray-950 p-6">{query.isLoading && !identityError ? <ActivityIndicator color="#a78bfa" /> : <Text className="text-center text-red-300">{identityError ?? (query.error instanceof Error ? query.error.message : 'Récap introuvable')}</Text>}</View>;
  return <ScrollView className="flex-1 bg-gray-950" contentContainerClassName="gap-4 p-4 pb-12">
    <View className="gap-2"><Text className="text-3xl font-black text-white">{euros.format(recap.content.summary.raisedCents / 100)}</Text><Text className="text-sm text-gray-400">du {dateTime.format(new Date(recap.periodStart))} au {dateTime.format(new Date(recap.periodEnd))}</Text></View>
    <View className="flex-row gap-3"><View className="flex-1 rounded-2xl bg-violet-950 p-4"><Text className="text-xs text-violet-300">Pic viewers</Text><Text className="mt-1 text-xl font-black text-white">{recap.content.summary.peakViewers.toLocaleString('fr-FR')}</Text></View><View className="flex-1 rounded-2xl bg-violet-950 p-4"><Text className="text-xs text-violet-300">Goals atteints</Text><Text className="mt-1 text-xl font-black text-white">{recap.content.counts.goalsReached}</Text></View></View>
    {recap.content.highlights.length > 0 && <Section title="À retenir">{recap.content.highlights.map((text, index) => <Text key={index} className="text-sm leading-5 text-gray-300">• {text}</Text>)}</Section>}
    {recap.content.topProgressions.length > 0 && <Section title="Top progressions">{recap.content.topProgressions.map((item, index) => <View key={item.twitch} className="flex-row justify-between"><Text className="text-gray-300">{index + 1}. {item.display}</Text><Text className="font-bold text-violet-300">+{euros.format(item.raisedCents / 100)}</Text></View>)}</Section>}
    {recap.content.bigDonations.length > 0 && <Section title="Gros dons détectés">{recap.content.bigDonations.map((item, index) => <View key={`${item.occurredAt}-${index}`} className="flex-row justify-between gap-3"><Text className="flex-1 text-gray-300">{item.donor}{item.twitch ? ` → ${item.twitch}` : ''}</Text><Text className="font-bold text-emerald-300">{euros.format(item.amountCents / 100)}</Text></View>)}</Section>}
    {recap.content.goalsReached.length > 0 && <Section title="Donation goals">{recap.content.goalsReached.map((item, index) => <Text key={`${item.occurredAt}-${index}`} className="text-sm text-gray-300"><Text className="font-bold text-white">{item.display}</Text> — {item.label}</Text>)}</Section>}
    {recap.content.liveStarts.length > 0 && <Section title="Nouveaux lives">{recap.content.liveStarts.map((item, index) => <Text key={`${item.occurredAt}-${index}`} className="text-sm text-gray-300">{item.display}</Text>)}</Section>}
  </ScrollView>;
}
