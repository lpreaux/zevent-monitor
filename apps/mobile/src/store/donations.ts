import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { donorKey } from '@/lib/donations';
import { zustandStorage } from './storage';

/**
 * Seuils proposés pour « gros don ». Alignés sur ceux des notifications
 * (`BIG_DONATION_THRESHOLDS_CENTS`) : ce qu'on surveille dans le feed et ce qui réveille
 * le téléphone doivent se dire avec les mêmes montants.
 */
export const BIG_DONATION_STEPS_CENTS = [10_000, 50_000, 100_000] as const;

interface DonationsPrefsState {
  /** Montant à partir duquel un don est mis en avant, et que filtre la pastille « gros dons ». */
  thresholdCents: number;
  setThresholdCents: (cents: number) => void;
  /**
   * Nom sous lequel l'utilisateur donne, pour se retrouver dans les classements. Reste sur
   * l'appareil : rien ne prouve qu'un pseudo de donateur appartienne à qui le saisit, ce
   * n'est pas une identité qu'on synchronise.
   */
  donorName: string | null;
  setDonorName: (name: string | null) => void;
  /** Le don vient-il de l'utilisateur, d'après le nom qu'il a déclaré ? */
  isMine: (donor: string) => boolean;
}

export const useDonationsPrefs = create<DonationsPrefsState>()(
  persist(
    (set, get) => ({
      thresholdCents: BIG_DONATION_STEPS_CENTS[0],
      setThresholdCents: (cents) => set({ thresholdCents: cents }),
      donorName: null,
      setDonorName: (name) => {
        const clean = name?.trim() ?? '';
        set({ donorName: clean.length > 0 ? clean : null });
      },
      isMine: (donor) => {
        const mine = get().donorName;
        return mine !== null && donorKey(donor) === donorKey(mine);
      },
    }),
    {
      name: 'donations-prefs',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        thresholdCents: state.thresholdCents,
        donorName: state.donorName,
      }),
    },
  ),
);
