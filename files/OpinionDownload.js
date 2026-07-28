/**
 * OpinionDownload
 *
 * Renders the three-option download panel for doctor's opinion on the patient side.
 * Options:
 *   1. Download in English only
 *   2. Download in patient's chosen language only
 *   3. Download both (English + chosen language, side-by-side or stacked)
 *
 * The physician side NEVER sees this component — it reads the opinion in English only.
 *
 * Usage:
 *   <OpinionDownload opinionId={id} patientId={patientId} />
 */

import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

export default function OpinionDownload({ opinionId, patientId, opinionEnglishText }) {
  const { t, currentLang, langInfo, isAutoTranslated, translateText } = useI18n();
  const [downloading, setDownloading] = useState(null); // 'en' | 'lang' | 'both'
  const [error, setError] = useState('');

  const download = async (type) => {
    setDownloading(type);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      const url = `${process.env.REACT_APP_API_URL}/api/patients/${patientId}/opinions/${opinionId}/download`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          format: type,           // 'en' | 'lang' | 'both'
          language: currentLang,  // target language code
        }),
      });

      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `ThyroConsult_Opinion_${opinionId}_${type === 'en' ? 'EN' : type === 'lang' ? currentLang.toUpperCase() : 'EN_' + currentLang.toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(t('errors.generic'));
    } finally {
      setDownloading(null);
    }
  };

  const isCurrentLangEnglish = currentLang === 'en';

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
        {t('opinion.downloadTitle')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Option 1: English only */}
        <DownloadButton
          icon="🇬🇧"
          label={t('opinion.downloadEn')}
          loading={downloading === 'en'}
          onClick={() => download('en')}
          primary={isCurrentLangEnglish}
        />

        {/* Option 2: In chosen language (only if not English) */}
        {!isCurrentLangEnglish && (
          <DownloadButton
            icon="🇮🇳"
            label={t('opinion.downloadLang', { lang: langInfo.nativeLabel })}
            sublabel={isAutoTranslated ? t('lang.disclaimer') : null}
            loading={downloading === 'lang'}
            onClick={() => download('lang')}
          />
        )}

        {/* Option 3: Both (only if not English) */}
        {!isCurrentLangEnglish && (
          <DownloadButton
            icon="📄"
            label={t('opinion.downloadBoth', { lang: langInfo.nativeLabel })}
            sublabel="English first, then your language"
            loading={downloading === 'both'}
            onClick={() => download('both')}
            primary
          />
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--red-600, #c00)', marginTop: 8 }}>{error}</p>
      )}

      {/* Auto-translate note */}
      {isAutoTranslated && (
        <p style={{ fontSize: 11, color: '#999', marginTop: 10 }}>
          {t('opinion.autoTranslateNote')}
        </p>
      )}
    </div>
  );
}

function DownloadButton({ icon, label, sublabel, loading, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 14px',
        borderRadius: 8,
        border: primary ? '2px solid #072654' : '1px solid var(--border-color, #ddd)',
        background: primary ? 'rgba(7,38,84,0.05)' : 'transparent',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        fontFamily: 'inherit',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', fontWeight: primary ? 600 : 400 }}>
          {loading ? '⏳ Preparing PDF...' : label}
        </span>
        {sublabel && (
          <span style={{ display: 'block', fontSize: 11, color: '#999', marginTop: 2 }}>
            {sublabel}
          </span>
        )}
      </span>
      {!loading && <span style={{ fontSize: 16, color: '#072654', flexShrink: 0, marginTop: 1 }}>↓</span>}
    </button>
  );
}
