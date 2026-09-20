import { useState } from 'react';
import { keyResultsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

export const CONFIDENCE_LABELS = { 1: 'Very low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very high' };

export default function SubmitCheckInForm({ keyResultId, rubric, label, onCreated }) {
  const [rubricLevelId, setRubricLevelId] = useState(rubric.levels[0]?.id ?? '');
  const [confidence, setConfidence] = useState(3);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await keyResultsApi.createCheckIn(keyResultId, { rubricLevelId, confidence, comment: comment.trim() || undefined });
      setComment('');
      onCreated();
    } catch (err) {
      setError(err.message ?? `Failed to submit ${label.toLowerCase()}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
      <div>
        <label style={s.label}>Score</label>
        <select style={{ ...s.select, maxWidth: 240 }} value={rubricLevelId} onChange={(e) => setRubricLevelId(e.target.value)}>
          {rubric.levels.map((lvl) => <option key={lvl.id} value={lvl.id}>{lvl.label}</option>)}
        </select>
      </div>
      <div>
        <label style={s.label}>Confidence</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button" onClick={() => setConfidence(n)}
              style={{
                ...s.btnSecondary, padding: '6px 12px', fontSize: 12,
                background: confidence === n ? colors.brand600 : colors.panel,
                color: confidence === n ? '#fff' : colors.ink700,
                borderColor: confidence === n ? colors.brand600 : colors.line,
              }}
            >
              {n} — {CONFIDENCE_LABELS[n]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={s.label}>Comment (optional)</label>
        <textarea
          style={{ ...s.formInput, minHeight: 60, resize: 'vertical' }}
          value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="What's changed since the last check-in?"
        />
      </div>
      <div>
        <button type="submit" disabled={submitting} style={s.btnPrimary}>{submitting ? 'Submitting…' : `Submit ${label}`}</button>
      </div>
      {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
    </form>
  );
}
