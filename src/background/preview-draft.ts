import type { PrivacyMode, Settings, TagInfo } from '@common/types';
import type { ExportTargets } from '@common/preview';

export type PreviewDraft = {
  llmBaseUrl?: string;
  llmModel?: string;
  llmMaxChars?: number;
  privacyMode?: PrivacyMode;
  pinboardConfigured?: boolean;
  readwiseConfigured?: boolean;
  readwiseCaptureEnabled?: boolean;
  exportTargets?: ExportTargets;
};

export function settingsWithPreviewDraft(settings: Settings, draft?: PreviewDraft): Settings {
  if (!draft) return settings;
  return {
    ...settings,
    llm: {
      ...settings.llm,
      baseUrl: draft.llmBaseUrl ?? settings.llm.baseUrl,
      model: draft.llmModel ?? settings.llm.model,
      maxChars: Number.isFinite(draft.llmMaxChars) ? Number(draft.llmMaxChars) : settings.llm.maxChars
    },
    privacy: {
      ...settings.privacy,
      mode: draft.privacyMode ?? settings.privacy.mode
    }
  };
}

export function knownTagNames(map: Record<string, TagInfo>, limit: number): string[] {
  return Object.keys(map)
    .sort((a, b) => (map[b]?.count || 0) - (map[a]?.count || 0))
    .slice(0, limit);
}
