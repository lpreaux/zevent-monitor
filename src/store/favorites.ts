import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

interface FavoritesState {
  /** Logins Twitch (minuscules) des streamers suivis. */
  favorites: string[];
  hydrated: boolean;
  toggle: (twitch: string) => void;
  isFavorite: (twitch: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      hydrated: false,
      toggle: (twitch) => {
        const login = twitch.toLowerCase();
        const current = get().favorites;
        set({
          favorites: current.includes(login)
            ? current.filter((f) => f !== login)
            : [...current, login],
        });
      },
      isFavorite: (twitch) => get().favorites.includes(twitch.toLowerCase()),
    }),
    {
      name: 'favorites',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ favorites: state.favorites }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
