// src/pages/doctor/PhysicianPortal.js
//
// Replaces DoctorPortal.js as the live /doctor/* route. DoctorPortal.js was
// built around a legacy live-appointment/"consultation" model (video/audio/
// text badges, GST, a `consultations` table) that predates several purge
// sessions (GST removal, video/audio/text removal, consultation->opinion
// language rename) and never got updated. This page is built entirely on
// the current async "online opinion" backend instead:
//   - physicianAPI.getPhysicianQueue / OpinionWriter  → write the initial
//     opinion for a new patient (opinionController.js)
//   - physicianAPI.getPendingWork / InvestigationReview / FollowUpReview →
//     review investigation reports & follow-up visits for existing
//     patients (physicianController.js)
// Both halves were previously built but never imported/rendered anywhere.

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { doctorAPI, physicianAPI } from '../../api';
import { DoctorSidebar } from '../../components/common/Sidebar';
import { useAuth } from '../../context/AuthContext';
import PhysicianQueue from '../../components/physician/PhysicianQueue';
import OpinionWriter from '../../components/physician/OpinionWriter';
import PhysicianDashboard from './PhysicianDashboard';

const DoctorLayout = ({ children, doctor }) => (
  <div className="app-shell">
    <DoctorSidebar doctor={doctor} />
    <main className="main-area">
      <div className="page-content">{children}</div>
    </main>
  </div>
);

// ─── Weekly stats card (kept from the old DoctorPortal — this one's real,
// added in a prior session, backed by GET /doctor/weekly-stats) ──────────
const WeeklyStatsCard = () => {
  const [weeklyStats, setWeeklyStats] = useState(null);

  useEffect(() => {
    doctorAPI.getWeeklyStats().then(setWeeklyStats).catch(() => {});
  }, []);

  if (!weeklyStats) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>This week</div>
        <span className="badge badge-blue">{weeklyStats.total ?? 0} total</span>
      </div>
      {weeklyStats.total === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No opinions written this week yet.</div>
      ) : (
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--teal-600)' }}>{weeklyStats.newRegistrations}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>New patients</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--blue-600)' }}>{weeklyStats.followUps}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Follow-ups</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tab 1: write online opinions (new patients) ──────────────────────────
const OpinionsTab = () => {
  const [selectedEpisode, setSelectedEpisode] = useState(null); // from queue row
  const [reviewData,      setReviewData]      = useState(null); // full episode-for-review payload
  const [loading,         setLoading]         = useState(false);
  const [refreshKey,      setRefreshKey]      = useState(0);

  const openEpisode = useCallback(async (ep) => {
    setSelectedEpisode(ep);
    setLoading(true);
    try {
      const res = await physicianAPI.getEpisodeForReview(ep.episodeId);
      setReviewData(res.data);
    } catch (err) {
      console.error('getEpisodeForReview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const backToQueue = () => {
    setSelectedEpisode(null);
    setReviewData(null);
    setRefreshKey(k => k + 1); // force PhysicianQueue to reload on return
  };

  if (selectedEpisode) {
    if (loading || !reviewData) {
      return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading episode…</div>;
    }
    return (
      <OpinionWriter
        episodeId={selectedEpisode.episodeId}
        existingOpinion={reviewData.opinion}
        questionnaire={reviewData.questionnaire}
        conditionType={reviewData.episode?.condition}
        onSaved={() => {}}
        onSubmitted={backToQueue}
        onBack={backToQueue}
      />
    );
  }

  return <PhysicianQueue key={refreshKey} onSelectEpisode={openEpisode} />;
};

// ─── Home: tabbed dashboard ────────────────────────────────
const PhysicianHome = ({ doctor }) => {
  const [tab, setTab] = useState('opinions'); // 'opinions' | 'reviews'

  return (
    <div>
      <WeeklyStatsCard />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'opinions', label: 'Write opinions' },
          { key: 'reviews',  label: 'Reviews pending' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'opinions' ? <OpinionsTab /> : <PhysicianDashboard doctor={doctor} />}
    </div>
  );
};

// ─── Physician portal ───────────────────────────────────────
const PhysicianPortal = () => {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState(null);

  useEffect(() => {
    if (user?.id) doctorAPI.getProfile().then(setDoctor).catch(() => {});
  }, [user]);

  return (
    <DoctorLayout doctor={doctor}>
      <Routes>
        <Route path="dashboard" element={<PhysicianHome doctor={doctor} />} />
        <Route path="*" element={<Navigate to="/doctor/dashboard" replace />} />
      </Routes>
    </DoctorLayout>
  );
};

export default PhysicianPortal;
