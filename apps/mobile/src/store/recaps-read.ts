import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

/**
 * Récaps déjà ouverts.
 *
 * Les récaps arrivent seuls — à l'horaire programmé, ou parce qu'une journée s'achève — et
 * rien dans la liste ne disait ce qui restait à lire. La marque est purement locale : elle
 * décrit la lecture sur cet appareil, pas le récap lui-même, qui est le même pour tous.
 */
interface RecapsReadState {
  read: string[];
  markRead: (id: string) => void;
  isRead: (id: string) => boolean;
}

/** Au-delà, les plus anciens sortent : un récap oublié depuis longtemps n'est plus « non lu ». */
const MAX_TRACKED = 200;

export const useRecapsReadStore = create<RecapsReadState>()(
  persist(
    (set, get) => ({
      read: [],
      markRead: (id) =>
        set((state) =>
          state.read.includes(id) ? state : { read: [id, ...state.read].slice(0, MAX_TRACKED) },
        ),
      isRead: (id) => get().read.includes(id),
    }),
    {
      name: 'recaps-read',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ read: state.read }),
    },
  ),
);
