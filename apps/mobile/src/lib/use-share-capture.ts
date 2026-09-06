import { useCallback, useState, type RefObject } from 'react';
import { Platform, Share, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

export type ShareStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'done' };

export interface ShareCapture {
  status: ShareStatus;
  /** PNG de la vue, via la feuille système ; repli texte là où le module manque. */
  shareImage: () => Promise<void>;
  shareText: () => Promise<void>;
  busy: boolean;
}

/**
 * Partage d'une carte rendue à l'écran : l'image d'abord, le texte en repli.
 *
 * Le repli n'est pas une politesse : sur le web, et partout où le module de partage de
 * fichiers manque ou se voit refuser, `Sharing` ne rend rien du tout. Mieux vaut alors
 * une ligne de texte qu'un bouton qui ne fait rien.
 *
 * La référence de la vue reste à l'appelant plutôt que d'être rendue ici : un `ref` qui
 * transite par un objet de retour serait lu pendant le rendu, ce que React ne garantit
 * pas — et ce que son linter refuse.
 */
export function useShareCapture(
  cardRef: RefObject<View | null>,
  buildText: () => string | null,
  dialogTitle: string,
): ShareCapture {
  const [status, setStatus] = useState<ShareStatus>({ kind: 'idle' });

  const fail = useCallback((error: unknown) => {
    setStatus({
      kind: 'error',
      message: error instanceof Error ? error.message : 'Partage impossible',
    });
  }, []);

  const shareText = useCallback(async () => {
    const message = buildText();
    if (!message) return;
    setStatus({ kind: 'busy' });
    try {
      await Share.share({ message });
      setStatus({ kind: 'done' });
    } catch (error) {
      fail(error);
    }
  }, [buildText, fail]);

  const shareImage = useCallback(async () => {
    if (!cardRef.current) return;
    const message = buildText();
    setStatus({ kind: 'busy' });
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        if (message) await Share.share({ message });
        setStatus({ kind: 'done' });
        return;
      }
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
      setStatus({ kind: 'done' });
    } catch (error) {
      fail(error);
    }
  }, [cardRef, buildText, dialogTitle, fail]);

  return { status, shareImage, shareText, busy: status.kind === 'busy' };
}
