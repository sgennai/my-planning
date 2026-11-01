// What the buttons inside an edition can do with it: say whether something is
// in À retenir, save it there (or take it out, after asking), and say what
// happened. Provided by the reader for the edition it shows.
import { createContext, useContext } from 'react';
import type { SaveInput, SavedInsight } from './saved';

export interface EditionActions {
  savedItem: (input: SaveInput) => SavedInsight | undefined;
  /** Saves it; if it is saved already, removes it once you confirm. */
  toggleSave: (input: SaveInput) => void;
  note: (text: string) => void;
}

const NONE: EditionActions = { savedItem: () => undefined, toggleSave: () => {}, note: () => {} };

export const EditionActionsContext = createContext<EditionActions>(NONE);

export const useEditionActions = () => useContext(EditionActionsContext);
