// BCP 47 locale tags accepted for user date/time formatting preferences.
// British English (en-GB) is the default.
export const ALLOWED_LOCALES: ReadonlySet<string> = new Set([
  'en-GB', 'en-US', 'en-AU', 'en-CA', 'en-NZ', 'en-ZA',
  'fr-FR', 'fr-BE', 'fr-CA', 'fr-CH',
  'de-DE', 'de-AT', 'de-CH',
  'es-ES', 'es-MX', 'es-AR',
  'it-IT', 'pt-PT', 'pt-BR',
  'nl-NL', 'nl-BE',
  'pl-PL', 'cs-CZ', 'sk-SK', 'hu-HU', 'ro-RO',
  'sv-SE', 'nb-NO', 'da-DK', 'fi-FI',
  'ru-RU', 'uk-UA',
  'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR',
  'ar-SA', 'he-IL', 'tr-TR',
  'hi-IN', 'id-ID', 'th-TH',
]);
