import { createContext, useContext, useEffect, useState } from 'react';
import { terminologyApi } from '../services/api.js';
import { useRole } from './RoleContext.jsx';

/**
 * FR-013: tenant-custom labels for the six core terms, applied to
 * primary UI surfaces — nav links, page titles, section headers, and
 * the main create/add buttons (App.jsx, Objectives.jsx,
 * ObjectiveDetail.jsx, OkrSettings.jsx). Deliberately not applied
 * everywhere — backend validation-error text (e.g. "cadenceId does not
 * exist") is untouched; see terminologyService.js's module comment for
 * the same scope note from the other side.
 */

export const DEFAULT_TERMS = {
  Objective: 'Objective',
  KeyResult: 'Key Result',
  Cycle: 'Cycle',
  CheckIn: 'Check-in',
  Initiative: 'Initiative',
  Reflection: 'Reflection',
};

const TerminologyContext = createContext({ terms: DEFAULT_TERMS, reload: () => {} });

export function TerminologyProvider({ children }) {
  const { user } = useRole();
  const [terms, setTerms] = useState(DEFAULT_TERMS);

  function reload() {
    if (!user || !user.tenantId) { setTerms(DEFAULT_TERMS); return Promise.resolve(); }
    return terminologyApi.get()
      .then((result) => setTerms(result?.terms ?? DEFAULT_TERMS))
      .catch(() => setTerms(DEFAULT_TERMS));
  }

  useEffect(() => { reload(); }, [user?.tenantId, user?.passwordMustChange]); // eslint-disable-line react-hooks/exhaustive-deps

  return <TerminologyContext.Provider value={{ terms, reload }}>{children}</TerminologyContext.Provider>;
}

/**
 * A plain heuristic, not a full inflection library — handles ordinary
 * business nouns (Objective -> Objectives, Cadence -> Cadences,
 * Company -> Companies) correctly, but not every irregular plural
 * (Person -> Persons, not People). Good enough for what a TenantAdmin
 * is realistically going to rename these six terms to; flagged rather
 * than silently assumed complete.
 */
function pluralise(word) {
  if (!word) return word;
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
  return word + 's';
}

/**
 * useTerms() -> { t, tPlural, terms, reload }
 *   t('Objective')        -> the tenant's singular label
 *   tPlural('Objective')  -> pluralised (e.g. for a nav link or page title)
 */
export function useTerms() {
  const { terms, reload } = useContext(TerminologyContext);
  return {
    terms,
    reload,
    t: (key) => terms[key] ?? DEFAULT_TERMS[key] ?? key,
    tPlural: (key) => pluralise(terms[key] ?? DEFAULT_TERMS[key] ?? key),
  };
}
