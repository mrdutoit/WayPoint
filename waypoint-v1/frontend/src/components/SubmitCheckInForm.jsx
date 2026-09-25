import { useState } from 'react';
import { keyResultsApi } from '../services/api.js';
import { s } from '../styles/tokens.js';
import { statusColor } from './viz/Tooltip.jsx';
import '../pages/objectives.css';

export const CONFIDENCE_LABELS = { 1: 'Very low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very high' };

/*
 * 2026-09-24 redesign. Score is a row of status-coloured choices rather
 * than a dropdown (the rubric has 4–5 levels — all visible at once is one
 * click instead of three), and confidence is a 1–5 segmented scale that
 * fills up to the chosen value — Sam's Stage 2 review asked for a
 * low-friction control here, since it's captured on every Check-in.
 * Same payload and API call as before.
 */
export default function SubmitCheckInForm({ keyResultId, rubric, label, onCreated, onCancel }) {
  const levels = [...rubric.levels].sort((a, b) => (a.level_index ?? a.levelIndex ?? 0) - (b.level_index ?? b.levelIndex ?? 0));
  const [rubricLevelId, setRubricLevelId] = useState(null);
  const [confidence, setConfidence] = useState(3);
  const [hoverConf, setHoverConf] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rubricLevelId) {
      setError('Choose a score first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await keyResultsApi.createCheckIn(keyResultId, { rubricLevelId, confidence, comment: comment.trim() || undefined });
      setComment('');
      setRubricLevelId(null);
      onCreated();
    } catch (err) {
      setError(err.message ?? `Failed to submit ${label.toLowerCase()}`);
    } finally {
      setSubmitting(false);
    }
  }

  const shown = hoverConf ?? confidence;
  return (
    <form onSubmit={handleSubmit} className="ob-form">
      <div className="ob-field">
        <span>Where does it stand?</span>
        <div className="ob-choices" role="radiogroup" aria-label="Score">
          {levels.map((lvl) => (
            <button
              key={lvl.id} type="button" role="radio" aria-checked={rubricLevelId === lvl.id}
              className={`ob-choice${rubricLevelId === lvl.id ? ' on' : ''}`}
              style={{ '--choice': statusColor(lvl.label) }}
              onClick={() => setRubricLevelId(lvl.id)}
            >
              <span className="vz-dot" />{lvl.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ob-field">
        <span>How confident are you it will land?</span>
        <div className="ob-confidence" role="radiogroup" aria-label="Confidence" onPointerLeave={() => setHoverConf(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button" role="radio" aria-checked={confidence === n} aria-label={`${n}, ${CONFIDENCE_LABELS[n]}`}
              className={`ob-conf-seg${n === confidence ? ' on' : n < shown ? ' lit' : ''}`}
              onClick={() => setConfidence(n)} onPointerEnter={() => setHoverConf(n)}
            >
              {n}
            </button>
          ))}
          <span className="ob-conf-label">{CONFIDENCE_LABELS[shown]}</span>
        </div>
      </div>
      <label className="ob-field">
        <span>What&apos;s changed? <span style={{ fontWeight: 400, color: 'var(--ink500)' }}>(optional)</span></span>
        <textarea
          style={{ ...s.formInput, minHeight: 72, resize: 'vertical' }}
          value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="Progress, blockers, anything your manager should know"
        />
      </label>
      <div className="ob-form-row">
        <button type="submit" disabled={submitting} className="ob-btn ob-btn-primary">{submitting ? 'Submitting…' : `Submit ${label.toLowerCase()}`}</button>
        {onCancel && <button type="button" onClick={onCancel} className="ob-btn ob-btn-quiet">Cancel</button>}
      </div>
      {error && <div className="ob-error">{error}</div>}
    </form>
  );
}
