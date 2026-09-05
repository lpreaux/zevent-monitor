/** Ouverture des liens externes (Twitch, pages de don) partagée par les écrans. */

import { Linking } from 'react-native';

import { twitchLinks } from './format';

/** Ouvre la chaîne dans l'app Twitch, avec repli sur le web si elle est absente. */
export async function openTwitchStream(login: string): Promise<void> {
  const { app, web } = twitchLinks(login);
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web);
  }
}

/** Ouvre une page de don (Streamlabs Charity) dans le navigateur. */
export async function openDonationPage(url: string): Promise<void> {
  await Linking.openURL(url);
}
