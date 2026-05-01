import React, { type FC, useState } from 'react'
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  Stack,
  Select,
  MenuItem,
  FormControl,
  FormLabel,
  IconButton,
  Tooltip,
  Alert
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SparklesIcon from '@mui/icons-material/AutoAwesome'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useAppStore } from '../store/app-store'
import { useAIWriter } from '../hooks/useAIWriter'
import {
  formatOutline,
  TONE_STYLES,
  type OutlineItem,
  type SmartSuggestion
} from '../utils/ai-writing-utils'
import { SidePanel } from './shared/SidePanel'

export const AIAssistantPanel: FC = () => {
  const {
    aiAssistantOpen,
    setAIAssistantOpen,
    documentContent,
    addToast
  } = useAppStore()

  const {
    generateOutline: aiGenerateOutline,
    generateTitles: aiGenerateTitles,
    generateIntroduction: aiGenerateIntro,
    generateConclusion: aiGenerateConcl,
    adjustTone: aiAdjustTone,
    paraphrase: aiParaphrase,
    adjustComplexity: aiAdjustComplex,
    translate: aiTranslate
  } = useAIWriter({
    onError: (error) => addToast('error', `AI Error: ${error}`)
  })

  const [tab, setTab] = useState<'content' | 'enhance'>('content')
  const [contentTask, setContentTask] = useState<'outline' | 'title' | 'intro' | 'conclusion' | 'paragraph'>('outline')
  const [topic, setTopic] = useState('')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [generatedText, setGeneratedText] = useState('')

  const [enhanceTask, setEnhanceTask] = useState<'tone' | 'paraphrase' | 'complexity' | 'translate'>('tone')
  const [selectedText, setSelectedText] = useState(documentContent)
  const [targetTone, setTargetTone] = useState<'formal' | 'casual' | 'professional'>('professional')
  const [targetComplexity, setTargetComplexity] = useState<'simple' | 'moderate' | 'advanced'>('moderate')
  const [targetLanguage, setTargetLanguage] = useState('Spanish')
  const [enhanceResult, setEnhanceResult] = useState('')

  const [loading, setLoading] = useState(false)

  if (!aiAssistantOpen) return null

  const handleGenerateOutline = async () => {
    if (!topic.trim()) {
      addToast('warning', 'Please enter a topic')
      return
    }
    setLoading(true)
    try {
      const result = await aiGenerateOutline(topic)
      if (Array.isArray(result)) {
        setOutline(result)
        addToast('success', 'Outline generated successfully')
      } else {
        throw new Error('Invalid outline response')
      }
    } catch (error) {
      addToast('error', 'Failed to generate outline')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateTitles = async () => {
    if (!topic.trim()) {
      addToast('warning', 'Please enter a topic or content')
      return
    }
    setLoading(true)
    try {
      const titles = await aiGenerateTitles(topic)
      if (Array.isArray(titles)) {
        setGeneratedText(titles.join('\n'))
        addToast('success', 'Title suggestions generated')
      } else {
        throw new Error('Invalid titles response')
      }
    } catch (error) {
      addToast('error', 'Failed to generate titles')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateIntro = async () => {
    if (!topic.trim()) {
      addToast('warning', 'Please enter a topic')
      return
    }
    setLoading(true)
    try {
      const intro = await aiGenerateIntro(topic, 'medium')
      setGeneratedText(intro)
      addToast('success', 'Introduction generated')
    } catch (error) {
      addToast('error', 'Failed to generate introduction')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateConclusion = async () => {
    if (!topic.trim()) {
      addToast('warning', 'Please enter main points')
      return
    }
    setLoading(true)
    try {
      const mainPoints = topic.split('\n').filter(p => p.trim())
      const conclusion = await aiGenerateConcl('document', mainPoints, 'medium')
      setGeneratedText(conclusion)
      addToast('success', 'Conclusion generated')
    } catch (error) {
      addToast('error', 'Failed to generate conclusion')
    } finally {
      setLoading(false)
    }
  }

  const handleAdjustTone = async () => {
    if (!selectedText.trim()) {
      addToast('warning', 'Please select text to adjust')
      return
    }
    setLoading(true)
    try {
      const result = await aiAdjustTone(selectedText, targetTone)
      setEnhanceResult(result)
      addToast('success', `Text adjusted to ${targetTone} tone`)
    } catch (error) {
      addToast('error', 'Failed to adjust tone')
    } finally {
      setLoading(false)
    }
  }

  const handleParaphrase = async () => {
    if (!selectedText.trim()) {
      addToast('warning', 'Please select text to paraphrase')
      return
    }
    setLoading(true)
    try {
      const suggestions = await aiParaphrase(selectedText)
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        setEnhanceResult(suggestions[0])
        addToast('success', 'Paraphrase suggestions generated')
      } else {
        throw new Error('No suggestions returned')
      }
    } catch (error) {
      addToast('error', 'Failed to generate paraphrases')
    } finally {
      setLoading(false)
    }
  }

  const handleAdjustComplexity = async () => {
    if (!selectedText.trim()) {
      addToast('warning', 'Please select text to adjust')
      return
    }
    setLoading(true)
    try {
      const result = await aiAdjustComplex(selectedText, targetComplexity)
      setEnhanceResult(result)
      addToast('success', `Text adjusted to ${targetComplexity} level`)
    } catch (error) {
      addToast('error', 'Failed to adjust complexity')
    } finally {
      setLoading(false)
    }
  }

  const handleTranslate = async () => {
    if (!selectedText.trim()) {
      addToast('warning', 'Please select text to translate')
      return
    }
    setLoading(true)
    try {
      const result = await aiTranslate(selectedText, targetLanguage)
      setEnhanceResult(result)
      addToast('success', `Text translated to ${targetLanguage}`)
    } catch (error) {
      addToast('error', 'Failed to translate')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidePanel
      title="AI Assistant"
      onClose={() => setAIAssistantOpen(false)}
      width={420}
      headerContent={
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flex: 1 }}>
          <SparklesIcon sx={{ fontSize: 18, color: 'warning.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>AI Writing Assistant</Typography>
        </Box>
      }
    >
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
      >
        <Tab label="Content" value="content" sx={{ fontSize: 11, textTransform: 'none' }} />
        <Tab label="Enhance" value="enhance" sx={{ fontSize: 11, textTransform: 'none' }} />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {tab === 'content' && (
          <Stack spacing={2}>
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, textTransform: 'uppercase' }}>
              Content Generation
            </Typography>

            <FormControl fullWidth size="small">
              <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>Task</FormLabel>
              <Select value={contentTask} onChange={(e) => setContentTask(e.target.value as any)}>
                <MenuItem value="outline">Outline Generation</MenuItem>
                <MenuItem value="title">Title Suggestions</MenuItem>
                <MenuItem value="intro">Introduction</MenuItem>
                <MenuItem value="conclusion">Conclusion</MenuItem>
                <MenuItem value="paragraph">Paragraph Expansion</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label={contentTask === 'outline' ? 'Topic' : contentTask === 'conclusion' ? 'Main Points (one per line)' : 'Topic or Content'}
              multiline
              rows={contentTask === 'conclusion' ? 4 : 2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={contentTask === 'outline' ? 'e.g., Climate Change' : 'Enter your topic or content...'}
              fullWidth
            />

            {contentTask === 'outline' && (
              <Button
                variant="contained"
                size="small"
                onClick={handleGenerateOutline}
                disabled={loading || !topic.trim()}
                startIcon={<PlayArrowIcon />}
                fullWidth
              >
                Generate Outline
              </Button>
            )}

            {contentTask === 'title' && (
              <Button
                variant="contained"
                size="small"
                onClick={handleGenerateTitles}
                disabled={loading || !topic.trim()}
                startIcon={<PlayArrowIcon />}
                fullWidth
              >
                Suggest Titles
              </Button>
            )}

            {contentTask === 'intro' && (
              <Button
                variant="contained"
                size="small"
                onClick={handleGenerateIntro}
                disabled={loading || !topic.trim()}
                startIcon={<PlayArrowIcon />}
                fullWidth
              >
                Generate Introduction
              </Button>
            )}

            {contentTask === 'conclusion' && (
              <Button
                variant="contained"
                size="small"
                onClick={handleGenerateConclusion}
                disabled={loading || !topic.trim()}
                startIcon={<PlayArrowIcon />}
                fullWidth
              >
                Generate Conclusion
              </Button>
            )}

            {outline.length > 0 && (
              <Card sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, display: 'block', mb: 1 }}>
                    Generated Outline
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {formatOutline(outline)}
                  </Typography>
                  <Button size="small" startIcon={<ContentCopyIcon />} sx={{ mt: 1, fontSize: 9 }}>
                    Copy to Document
                  </Button>
                </CardContent>
              </Card>
            )}

            {generatedText && (
              <Card sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, display: 'block', mb: 1 }}>
                    Generated Content
                  </Typography>
                  <TextField
                    size="small"
                    multiline
                    rows={4}
                    fullWidth
                    value={generatedText}
                    onChange={(e) => setGeneratedText(e.target.value)}
                    sx={{ fontSize: 10 }}
                  />
                  <Button size="small" startIcon={<ContentCopyIcon />} sx={{ mt: 1, fontSize: 9 }}>
                    Copy to Document
                  </Button>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}

        {tab === 'enhance' && (
          <Stack spacing={2}>
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, textTransform: 'uppercase' }}>
              Writing Enhancement
            </Typography>

            <FormControl fullWidth size="small">
              <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>Enhancement</FormLabel>
              <Select value={enhanceTask} onChange={(e) => setEnhanceTask(e.target.value as any)}>
                <MenuItem value="tone">Tone Adjustment</MenuItem>
                <MenuItem value="paraphrase">Paraphrase</MenuItem>
                <MenuItem value="complexity">Complexity Level</MenuItem>
                <MenuItem value="translate">Translate</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Text to Enhance"
              multiline
              rows={3}
              value={selectedText}
              onChange={(e) => setSelectedText(e.target.value)}
              fullWidth
            />

            {enhanceTask === 'tone' && (
              <>
                <FormControl fullWidth size="small">
                  <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>Target Tone</FormLabel>
                  <Select value={targetTone} onChange={(e) => setTargetTone(e.target.value as any)}>
                    <MenuItem value="formal">Formal</MenuItem>
                    <MenuItem value="casual">Casual</MenuItem>
                    <MenuItem value="professional">Professional</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                  {TONE_STYLES[targetTone]?.description}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleAdjustTone}
                  disabled={loading || !selectedText.trim()}
                  startIcon={<PlayArrowIcon />}
                  fullWidth
                >
                  Adjust Tone
                </Button>
              </>
            )}

            {enhanceTask === 'paraphrase' && (
              <Button
                variant="contained"
                size="small"
                onClick={handleParaphrase}
                disabled={loading || !selectedText.trim()}
                startIcon={<PlayArrowIcon />}
                fullWidth
              >
                Generate Paraphrases
              </Button>
            )}

            {enhanceTask === 'complexity' && (
              <>
                <FormControl fullWidth size="small">
                  <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>Target Complexity</FormLabel>
                  <Select value={targetComplexity} onChange={(e) => setTargetComplexity(e.target.value as any)}>
                    <MenuItem value="simple">Simple</MenuItem>
                    <MenuItem value="moderate">Moderate</MenuItem>
                    <MenuItem value="advanced">Advanced</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleAdjustComplexity}
                  disabled={loading || !selectedText.trim()}
                  startIcon={<PlayArrowIcon />}
                  fullWidth
                >
                  Adjust Complexity
                </Button>
              </>
            )}

            {enhanceTask === 'translate' && (
              <>
                <FormControl fullWidth size="small">
                  <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>Target Language</FormLabel>
                  <Select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                    <MenuItem value="Spanish">Spanish</MenuItem>
                    <MenuItem value="French">French</MenuItem>
                    <MenuItem value="German">German</MenuItem>
                    <MenuItem value="Chinese">Chinese</MenuItem>
                    <MenuItem value="Japanese">Japanese</MenuItem>
                    <MenuItem value="Italian">Italian</MenuItem>
                    <MenuItem value="Portuguese">Portuguese</MenuItem>
                    <MenuItem value="Dutch">Dutch</MenuItem>
                    <MenuItem value="Swedish">Swedish</MenuItem>
                    <MenuItem value="Norwegian">Norwegian</MenuItem>
                    <MenuItem value="Danish">Danish</MenuItem>
                    <MenuItem value="Finnish">Finnish</MenuItem>
                    <MenuItem value="Greek">Greek</MenuItem>
                    <MenuItem value="Polish">Polish</MenuItem>
                    <MenuItem value="Czech">Czech</MenuItem>
                    <MenuItem value="Romanian">Romanian</MenuItem>
                    <MenuItem value="Hungarian">Hungarian</MenuItem>
                    <MenuItem value="Turkish">Turkish</MenuItem>
                    <MenuItem value="Russian">Russian</MenuItem>
                    <MenuItem value="Arabic">Arabic</MenuItem>
                    <MenuItem value="Korean">Korean</MenuItem>
                    <MenuItem value="Scottish Gaelic">Scottish Gaelic</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleTranslate}
                  disabled={loading || !selectedText.trim()}
                  startIcon={<PlayArrowIcon />}
                  fullWidth
                >
                  Translate
                </Button>
              </>
            )}

            {enhanceResult && (
              <Card sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, display: 'block', mb: 1 }}>
                    Enhanced Result
                  </Typography>
                  <TextField
                    size="small"
                    multiline
                    rows={4}
                    fullWidth
                    value={enhanceResult}
                    onChange={(e) => setEnhanceResult(e.target.value)}
                    sx={{ fontSize: 10 }}
                  />
                  <Button size="small" startIcon={<ContentCopyIcon />} sx={{ mt: 1, fontSize: 9 }}>
                    Copy to Document
                  </Button>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}

      </Box>
    </SidePanel>
  )
}
