import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persistance clé/valeur pour Zustand, adossée à AsyncStorage (support natif + web). */
export const zustandStorage = AsyncStorage;
