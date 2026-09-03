import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { generateRecap, getRecaps, getRecapSchedules, putRecapSchedules, type Recap } from '@/api/recaps';
import { useRecapIdentity } from '@/lib/use-recap-identity';

const durations = [60, 180, 360, 720, 1440];
const suggestedTimes = ['00:00', '09:00', '17:00', '20:00'];
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function RecapCard({ recap, onPress }: { recap: Recap; onPress: () => void }) {
  return <Pressable onPress={onPress} className="gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 active:opacity-70">
    <View className="flex-row items-start justify-between gap-3"><View className="flex-1">
      <Text className="text-base font-bold text-white">{euros.format(recap.content.summary.raisedCents / 100)} collectés</Text>
      <Text className="mt-1 text-xs text-gray-400">{dateTime.format(new Date(recap.periodStart))} → {dateTime.format(new Date(recap.periodEnd))}</Text>
    </View><View className="rounded-full bg-violet-950 px-2 py-1"><Text className="text-xs font-semibold text-violet-300">{recap.kind === 'manual' ? 'Manuel' : 'Programmé'}</Text></View></View>
    <View className="flex-row gap-4"><Text className="text-xs text-gray-300">{recap.content.counts.goalsReached} goals</Text><Text className="text-xs text-gray-300">{recap.content.counts.liveStarts} lives</Text><Text className="text-xs text-gray-300">Pic {recap.content.summary.peakViewers.toLocaleString('fr-FR')}</Text></View>
  </Pressable>;
}

export default function RecapsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { identity, error: identityError } = useRecapIdentity();
  const [duration, setDuration] = useState(1440);
  const [customHours, setCustomHours] = useState('');
  const [customTime, setCustomTime] = useState('');
  const recaps = useQuery({ queryKey: ['recaps', identity?.installationId], queryFn: () => getRecaps(identity!), enabled: Boolean(identity) });
  const schedules = useQuery({ queryKey: ['recap-schedules', identity?.installationId], queryFn: () => getRecapSchedules(identity!), enabled: Boolean(identity) });
  const generate = useMutation({
    mutationFn: (minutes: number) => generateRecap(identity!, minutes, Crypto.randomUUID()),
    onSuccess: async (recap) => { await queryClient.invalidateQueries({ queryKey: ['recaps', identity?.installationId] }); router.push(`/recap/${recap.id}` as never); },
  });
  const saveSchedules = useMutation({
    mutationFn: (times: string[]) => putRecapSchedules(identity!, times),
    onSuccess: (data) => queryClient.setQueryData(['recap-schedules', identity?.installationId], data),
  });
  const times = schedules.data?.times ?? [];
  const toggleTime = (time: string) => {
    const next = times.includes(time) ? times.filter((value) => value !== time) : [...times, time].sort();
    saveSchedules.mutate(next);
  };
  const parsedCustom = Number(customHours.replace(',', '.'));
  const chosenDuration = Number.isFinite(parsedCustom) && parsedCustom > 0 ? Math.round(parsedCustom * 60) : duration;
  const message = identityError ?? (recaps.error instanceof Error ? recaps.error.message : null);

  return <ScrollView className="flex-1 bg-gray-950" contentContainerClassName="gap-6 p-4 pb-12" refreshControl={<RefreshControl refreshing={recaps.isRefetching} onRefresh={() => void recaps.refetch()} tintColor="#a78bfa" />}>
    <View className="gap-1"><Text className="text-2xl font-black text-white">Récapitulatifs</Text><Text className="text-sm text-gray-400">Les moments importants d’une période, calculés sans IA et conservés dans l’historique.</Text></View>
    <View className="gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <Text className="text-lg font-bold text-white">Générer maintenant</Text>
      <View className="flex-row flex-wrap gap-2">{durations.map((minutes) => <Pressable key={minutes} onPress={() => { setDuration(minutes); setCustomHours(''); }} className={`rounded-full border px-3 py-2 ${duration === minutes && !customHours ? 'border-violet-400 bg-violet-950' : 'border-gray-700 bg-gray-950'}`}><Text className={duration === minutes && !customHours ? 'font-semibold text-violet-200' : 'text-gray-300'}>{minutes / 60} h</Text></Pressable>)}</View>
      <TextInput value={customHours} onChangeText={setCustomHours} keyboardType="decimal-pad" placeholder="Durée personnalisée en heures (max. 168)" placeholderTextColor="#6b7280" className="rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white" />
      <Pressable disabled={!identity || generate.isPending || chosenDuration < 15 || chosenDuration > 10080} onPress={() => generate.mutate(chosenDuration)} className="flex-row items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 disabled:opacity-40">{generate.isPending && <ActivityIndicator color="white" />}<Text className="font-bold text-white">Créer le récap</Text></Pressable>
      {generate.error && <Text className="text-sm text-red-400">{generate.error.message}</Text>}
    </View>
    <View className="gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <View><Text className="text-lg font-bold text-white">Récaps programmés</Text><Text className="mt-1 text-xs text-gray-400">Chaque période commence exactement à l’horaire précédent. Fuseau de l’appareil.</Text></View>
      <View className="flex-row flex-wrap gap-2">{suggestedTimes.map((time) => <Pressable key={time} disabled={!identity || saveSchedules.isPending} onPress={() => toggleTime(time)} className={`rounded-full border px-4 py-2 ${times.includes(time) ? 'border-violet-400 bg-violet-950' : 'border-gray-700 bg-gray-950'}`}><Text className={times.includes(time) ? 'font-bold text-violet-200' : 'text-gray-300'}>{time}</Text></Pressable>)}</View>
      {times.length === 0 && <Text className="text-xs text-amber-400">Planification désactivée. Les récaps manuels restent disponibles.</Text>}
      <View className="flex-row gap-2"><TextInput value={customTime} onChangeText={setCustomTime} placeholder="HH:MM" placeholderTextColor="#6b7280" maxLength={5} className="flex-1 rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white" /><Pressable disabled={!/^([01]\d|2[0-3]):[0-5]\d$/.test(customTime) || times.includes(customTime)} onPress={() => { toggleTime(customTime); setCustomTime(''); }} className="items-center justify-center rounded-xl bg-gray-700 px-4 disabled:opacity-40"><Ionicons name="add" size={22} color="white" /></Pressable></View>
      {saveSchedules.error && <Text className="text-sm text-red-400">{saveSchedules.error.message}</Text>}
    </View>
    <View className="gap-3"><View className="flex-row items-center justify-between"><Text className="text-lg font-bold text-white">Historique</Text>{recaps.data?.cached && <Text className="text-xs text-amber-400">Copie hors ligne</Text>}</View>
      {!identity && !message && <ActivityIndicator color="#a78bfa" />}{message && <Text className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{message}</Text>}
      {recaps.data?.recaps.map((recap) => <RecapCard key={recap.id} recap={recap} onPress={() => router.push(`/recap/${recap.id}` as never)} />)}
      {recaps.data?.recaps.length === 0 && <Text className="py-6 text-center text-gray-500">Aucun récap pour le moment.</Text>}
    </View>
  </ScrollView>;
}
