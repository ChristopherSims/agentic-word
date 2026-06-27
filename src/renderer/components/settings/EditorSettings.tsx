import React, { type FC } from 'react'
import { Box, Typography, Slider, Switch, FormControlLabel, FormControl, Select, MenuItem, Divider, TextField } from '@mui/material'
import { useAppStore } from '../../store/app-store'
import { SPELL_CHECK_LANGUAGES, LINE_SPACINGS, AUTO_SAVE_OPTIONS } from '../../themes'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const EditorSettings: FC = () => {
  const {
    tabSize, useTabsForIndentation, wordWrap, backupFrequency,
    autoSaveIntervalMs, spellCheckLang, defaultFontFamily, defaultFontSize, lineSpacing,
    showWordCount, documentMarginTop, documentMarginBottom, documentMarginLeft, documentMarginRight,
    autocorrectEnabled, smartQuotesEnabled, emDashEnabled,
    inlineSuggestionsEnabled, inlineSuggestionTriggerWordCount, inlineSuggestionContextLength, inlineSuggestionDebounceMs,
    inlineSuggestionTimeoutMs, inlineSuggestionCooldownMs,
    pageHeaderFooter,
    setTabSize, setUseTabsForIndentation, setWordWrap, setBackupFrequency,
    setAutoSaveInterval, setSpellCheckLang, setDefaultFontFamily, setDefaultFontSize, setLineSpacing,
    setShowWordCount, setDocumentMarginTop, setDocumentMarginBottom, setDocumentMarginLeft, setDocumentMarginRight,
    setAutocorrectEnabled, setSmartQuotesEnabled, setEmDashEnabled,
    setInlineSuggestionsEnabled, setInlineSuggestionTriggerWordCount, setInlineSuggestionContextLength, setInlineSuggestionDebounceMs,
    setInlineSuggestionTimeoutMs, setInlineSuggestionCooldownMs,
    setPageHeaderFooter
  } = useAppStore()

  return (
    <>
      <SectionTitle>Tab & Indentation</SectionTitle>
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Tab Size: {tabSize} spaces</Typography>
        <Slider value={tabSize} onChange={(_, v) => setTabSize(v as number)} min={1} max={8} step={1} valueLabelDisplay="auto" size="small" />
      </Box>
      <FormControlLabel control={<Switch checked={useTabsForIndentation} onChange={(e) => setUseTabsForIndentation(e.target.checked)} />} label={<Typography variant="caption">Use tabs for indentation</Typography>} sx={{ mb: 2 }} />

      <SectionTitle>Word Wrap</SectionTitle>
      <FormControlLabel control={<Switch checked={wordWrap} onChange={(e) => setWordWrap(e.target.checked)} />} label={<Typography variant="caption">Enable word wrap</Typography>} sx={{ mb: 2 }} />

      <SectionTitle>Backup Frequency</SectionTitle>
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Every {backupFrequency} minutes</Typography>
        <Slider value={backupFrequency} onChange={(_, v) => setBackupFrequency(v as number)} min={5} max={240} step={5} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v} min`} size="small" />
      </Box>

      <Divider sx={{ my: 2 }} />

      <SectionTitle>Auto-Save Interval</SectionTitle>
      <FormControl fullWidth size="small"><Select value={autoSaveIntervalMs} onChange={(e) => setAutoSaveInterval(Number(e.target.value))}>{AUTO_SAVE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value} sx={{ fontSize: 11 }}>{o.label}</MenuItem>)}</Select></FormControl>

      <SectionTitle>Spell Check Language</SectionTitle>
      <FormControl fullWidth size="small"><Select value={spellCheckLang} onChange={(e) => setSpellCheckLang(e.target.value)}>{SPELL_CHECK_LANGUAGES.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

      <SectionTitle>Default Font Family</SectionTitle>
      <FormControl fullWidth size="small"><Select value={defaultFontFamily} onChange={(e) => setDefaultFontFamily(e.target.value)}><MenuItem value="" sx={{ fontSize: 11 }}>(inherit)</MenuItem>{['Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'].map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 11 }}>{f}</MenuItem>)}</Select></FormControl>

      <SectionTitle>Default Font Size</SectionTitle>
      <FormControl fullWidth size="small"><Select value={defaultFontSize} onChange={(e) => setDefaultFontSize(e.target.value)}>{['12px', '14px', '16px', '18px', '20px', '24px'].map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s}</MenuItem>)}</Select></FormControl>

      <SectionTitle>Line Spacing</SectionTitle>
      <FormControl fullWidth size="small"><Select value={lineSpacing} onChange={(e) => setLineSpacing(e.target.value)}>{LINE_SPACINGS.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

      <SectionTitle>Document Margins (px)</SectionTitle>
      {[
        { label: 'Top', value: documentMarginTop, setter: setDocumentMarginTop },
        { label: 'Bottom', value: documentMarginBottom, setter: setDocumentMarginBottom },
        { label: 'Left', value: documentMarginLeft, setter: setDocumentMarginLeft },
        { label: 'Right', value: documentMarginRight, setter: setDocumentMarginRight },
      ].map(({ label, value, setter }) => (
        <Box key={label}>
          <Typography variant="caption" display="block" sx={{ mb: 0.5, fontSize: 11 }}>{label}: {value}px</Typography>
          <Slider size="small" min={0} max={100} step={5} value={value} onChange={(_, v) => setter(Array.isArray(v) ? v[0] : v)} valueLabelDisplay="auto" />
        </Box>
      ))}

      <FormControlLabel control={<Switch checked={showWordCount} onChange={(e) => setShowWordCount(e.target.checked)} />} label={<Typography variant="caption">Show word/char count</Typography>} />

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Autocorrect</Typography>
      <FormControlLabel control={<Switch checked={autocorrectEnabled} onChange={(e) => setAutocorrectEnabled(e.target.checked)} />} label={<Typography variant="caption">Autocorrect typos</Typography>} />
      <FormControlLabel control={<Switch checked={smartQuotesEnabled} onChange={(e) => setSmartQuotesEnabled(e.target.checked)} />} label={<Typography variant="caption">Smart quotes</Typography>} />
      <FormControlLabel control={<Switch checked={emDashEnabled} onChange={(e) => setEmDashEnabled(e.target.checked)} />} label={<Typography variant="caption">Em-dash (-- → —)</Typography>} />

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>AI Inline Suggestions</Typography>
      <FormControlLabel control={<Switch checked={inlineSuggestionsEnabled} onChange={(e) => setInlineSuggestionsEnabled(e.target.checked)} />} label={<Typography variant="caption">Enable inline smart suggestions</Typography>} />
      {inlineSuggestionsEnabled && (
        <>
          {[
            { label: `Trigger after ${inlineSuggestionTriggerWordCount} words`, value: inlineSuggestionTriggerWordCount, setter: setInlineSuggestionTriggerWordCount, min: 1, max: 10, step: 1 },
            { label: `Context length: ${inlineSuggestionContextLength} chars`, value: inlineSuggestionContextLength, setter: setInlineSuggestionContextLength, min: 50, max: 300, step: 10 },
            { label: `Response debounce: ${inlineSuggestionDebounceMs}ms`, value: inlineSuggestionDebounceMs, setter: setInlineSuggestionDebounceMs, min: 300, max: 3000, step: 100 },
            { label: `Suggestion timeout: ${Math.round(inlineSuggestionTimeoutMs / 1000)}s`, value: inlineSuggestionTimeoutMs, setter: setInlineSuggestionTimeoutMs, min: 5000, max: 30000, step: 1000 },
            { label: `Suggestion cooldown: ${Math.round(inlineSuggestionCooldownMs / 1000)}s`, value: inlineSuggestionCooldownMs, setter: setInlineSuggestionCooldownMs, min: 10000, max: 120000, step: 10000 },
          ].map(({ label, value, setter, min, max, step }) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, mt: 1, display: 'block' }}>{label}</Typography>
              <Slider size="small" min={min} max={max} step={step} value={value} onChange={(_, v) => setter(Array.isArray(v) ? v[0] : v)} valueLabelDisplay="auto" sx={{ my: 0.5 }} />
            </Box>
          ))}
        </>
      )}

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Header & Footer</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Use {'{n}'} for page number, {'{N}'} for total pages, {'{date}'} for today</Typography>
      <TextField label="Header Left" size="small" fullWidth value={pageHeaderFooter.headerLeft} onChange={(e) => setPageHeaderFooter({ ...pageHeaderFooter, headerLeft: e.target.value })} sx={{ mb: 0.5 }} />
      <TextField label="Header Center" size="small" fullWidth value={pageHeaderFooter.headerCenter} onChange={(e) => setPageHeaderFooter({ ...pageHeaderFooter, headerCenter: e.target.value })} sx={{ mb: 0.5 }} />
      <TextField label="Footer Center" size="small" fullWidth value={pageHeaderFooter.footerCenter} onChange={(e) => setPageHeaderFooter({ ...pageHeaderFooter, footerCenter: e.target.value })} placeholder="Page {n} of {N}" sx={{ mb: 0.5 }} />
      <FormControlLabel control={<Switch checked={pageHeaderFooter.showPageNumbers} onChange={(e) => setPageHeaderFooter({ ...pageHeaderFooter, showPageNumbers: e.target.checked })} />} label={<Typography variant="caption">Show page numbers</Typography>} />
      <FormControlLabel control={<Switch checked={pageHeaderFooter.showTitle} onChange={(e) => setPageHeaderFooter({ ...pageHeaderFooter, showTitle: e.target.checked })} />} label={<Typography variant="caption">Show title in header</Typography>} />
    </>
  )
}
