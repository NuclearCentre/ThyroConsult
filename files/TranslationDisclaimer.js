/**
 * TranslationDisclaimer
 *
 * Shows a yellow notice bar when the current language is auto-translated
 * (i.e. not English or Hindi).
 *
 * Place at the top of any page that has translated content.
 *
 * Usage:
 *   import TranslationDisclaimer from '../components/TranslationDisclaimer';
 *   <TranslationDisclaimer />
 */

import React from 'react';
import { useI18n } from '../i18n/I18nContext';

export default function TranslationDisclaimer({ style }) {
  const { isAutoTranslated, t, langInfo } = useI18n();

  if (!isAutoTranslated) return null;

  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 16px',
        background: '#fffde7',
        border: '1px solid #f9d923',
        borderRadius: 8,
        fontSize: 12,
        color: '#7a5f00',
        marginBottom: 12,
        ...style,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
      <div>
        <span style={{ fontWeight: 600 }}>{langInfo.nativeLabel}: </span>
        {t('lang.disclaimer')}
        {' '}
        <span style={{ color: '#999', fontSize: 11 }}>
          (This is an automated translation. The English version is legally binding.)
        </span>
      </div>
    </div>
  );
}
