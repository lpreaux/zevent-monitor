/** Ouverture des liens externes (Twitch, pages de don) partagée par les écrans. */

import { Linking } from 'react-native';

import { noteStreamerInteraction } from '@/store/streamer-affinity';
import { twitchLinks } from './format';

/**
 * Ouvre la chaîne dans l'app Twitch, avec repli sur le web si elle est absente.
 * Lancer un stream est le signal d'intérêt le plus fort après le don : il est
 * enregistré ici pour que tous les points d'entrée en bénéficient.
 */
export async function openTwitchStream(login: string): Promise<void> {
  noteStreamerInteraction(login, 'twitch');
  const { app, web } = twitchLinks(login);
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web);
  }
}

/** Ouvre une page de don (Streamlabs Charity) dans le navigateur. */
export async function openDonationPage(url: string, login?: string): Promise<void> {
  if (login) noteStreamerInteraction(login, 'donation');
  await Linking.openURL(url);
}
