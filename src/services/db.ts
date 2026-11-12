/**
 * ASTRA Health - Local Offline-First Database (Dexie IndexedDB)
 * Stores all health events, check-ins, alerts, conversations, and sync queue locally.
 */

import Dexie, { Table } from 'dexie';
import { indexedDB as fakeIDB, IDBKeyRange as fakeKeyRange } from 'fake-indexeddb';
import { HealthMeasurement, DailyCheckIn, HealthAlert, CognitiveTaskResult, MetricBaseline, RadiationMeasurement } from '../types/health';
import { MedicalReportRecord, ExtractedLabResult } from '../types/medicalReport';
import { ActivityRecord } from '../types/activity';
import { AIConversationMessage } from '../types/ai';
import { MissionContext, SyncQueueItem, TimelineEvent } from '../types/mission';
import { NasaRadiationContext, NasaSpaceWeatherEvent, NasaResearchItem, NasaUnifiedDatasetRecord } from '../types/nasa';
import { KnowledgeDoc, MISSION_KNOWLEDGE_BASE } from '../data/missionKnowledge';
import { generateInitialTelemetry } from '../data/mockTelemetry';
import { generateInitialActivities } from '../data/mockActivities';

export interface UserSettingsRecord {
  id: string;
  aiMode: 'ONLINE' | 'OFFLINE' | 'AUTO';
  role: string;
  theme: 'dark' | 'light' | 'system';
  localModelDownloaded: boolean;
  localModelName: string;
  fontSize: 'normal' | 'large';
  reducedMotion: boolean;
}

export class AstraDatabase extends Dexie {
  healthMeasurements!: Table<HealthMeasurement, string>;
  checkIns!: Table<DailyCheckIn, string>;
  alerts!: Table<HealthAlert, string>;
  activities!: Table<ActivityRecord, string>;
  aiConversations!: Table<AIConversationMessage, string>;
  timelineEvents!: Table<TimelineEvent, string>;
  missionContext!: Table<MissionContext, string>;
  baselineData!: Table<MetricBaseline, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  knowledgeBase!: Table<KnowledgeDoc, string>;
  cognitiveResults!: Table<CognitiveTaskResult, string>;
  userSettings!: Table<UserSettingsRecord, string>;
  nasaRadiation!: Table<NasaRadiationContext, string>;
  nasaSpaceWeather!: Table<NasaSpaceWeatherEvent, string>;
  nasaResearch!: Table<NasaResearchItem, string>;
  nasaDatasets!: Table<NasaUnifiedDatasetRecord, string>;
  radiationMeasurements!: Table<RadiationMeasurement, string>;
  medicalReports!: Table<MedicalReportRecord, string>;
  laboratoryResults!: Table<ExtractedLabResult & { sol: number; reportId?: string; date?: string }, string>;

  constructor(options?: { indexedDB?: any; IDBKeyRange?: any }) {
    super('AstraHealthDB', options);
    this.version(4).stores({
      healthMeasurements: 'id, sol, timestamp, crewId',
      checkIns: 'id, sol, timestamp, crewId, synced',
      alerts: 'id, sol, timestamp, severity, acknowledged',
      activities: 'id, sol, timestamp, category, loggedBy',
      aiConversations: 'id, timestamp, sender',
      timelineEvents: 'id, sol, timestamp, category, severity, synced',
      missionContext: 'missionId',
      baselineData: 'metricKey',
      syncQueue: 'id, tableName, queuedAt',
      knowledgeBase: 'id, category, *keywords',
      cognitiveResults: 'id, taskType, sol, timestamp',
      userSettings: 'id',
      nasaRadiation: 'id, timestamp, dataStatus',
      nasaSpaceWeather: 'id, startTime, type',
      nasaResearch: 'id, accession, topic',
      radiationMeasurements: 'id, sol, timestamp, source, measurementType, syncStatus',
      medicalReports: 'id, sol, timestamp, status',
      laboratoryResults: 'id, reportId, sol, category, name, status',
    });
    this.version(5).stores({
      checkIns: 'id, sol, timestamp, crewId, synced, *attachedReportIds',
    });
    this.version(6).stores({
      nasaDatasets: 'id, datasetId, agency, topic, syncStatus, observationTimestamp',
    });
  }
}

// Active database instance with fallback support
let activeDbInstance = new AstraDatabase();

export function switchToInMemoryDatabase(): AstraDatabase {
  console.warn('[ASTRA DB] Activating in-memory IndexedDB backing store (RAM fallback)...');
  try {
    activeDbInstance.close();
  } catch {}
  activeDbInstance = new AstraDatabase({ indexedDB: fakeIDB, IDBKeyRange: fakeKeyRange });
  return activeDbInstance;
}

export const db: AstraDatabase = new Proxy({} as AstraDatabase, {
  get(_target, prop) {
    const target = activeDbInstance as any;
    const val = target[prop];
    if (typeof val === 'function') {
      return val.bind(target);
    }
    return val;
  },
  set(_target, prop, value) {
    (activeDbInstance as any)[prop] = value;
    return true;
  }
});

/**
 * Initializes database with realistic spaceflight seed data if empty
 */
export async function initializeLocalDatabase(): Promise<void> {
  const populateData = async (targetDb: AstraDatabase) => {
    const count = await targetDb.healthMeasurements.count();
    if (count === 0) {
      // Seed 30 days of telemetry
      const telemetry = generateInitialTelemetry();
      await db.healthMeasurements.bulkPut(telemetry);

      // Seed initial activities
      const activities = generateInitialActivities();
      await db.activities.bulkPut(activities);

      // Seed initial knowledge base
      await db.knowledgeBase.bulkPut(MISSION_KNOWLEDGE_BASE);

      // Seed initial mission context
      await db.missionContext.put({
        missionId: 'MARS-01',
        name: 'MARS-01',
        sol: 184,
        missionPhase: 'Cruise',
        crewCount: 4,
        communicationStatus: 'ONLINE',
        earthCommsDelayMinutes: 14.2,
        radiationEnvironment: 'Deep Space Cruise (GCR + Solar Ambient)',
        metDays: 184,
        sleepScheduleWindow: '22:00 - 06:00 UTC',
        exerciseScheduleWindow: '09:30 - 11:30 UTC',
      });

      // Seed default settings
      await db.userSettings.put({
        id: 'default',
        aiMode: 'AUTO',
        role: 'Commander',
        theme: 'dark',
        localModelDownloaded: true, // ASTRA Core rule engine + local model layer ready
        localModelName: 'ASTRA Local Health Core v2.4 (Browser-Edge)',
        fontSize: 'normal',
        reducedMotion: false,
      });

      // Seed initial alerts
      await db.alerts.bulkPut([
        {
          id: 'alert-sol-184-multi',
          sol: 184,
          timestamp: new Date().toISOString(),
          severity: 'ORANGE',
          category: 'MULTI_METRIC',
          title: 'MULTI-METRIC CHANGE DETECTED',
          message: 'Multiple physiological indicators have simultaneously diverged from your 14-day rolling baseline.',
          contributingFactors: [
            'Resting Heart Rate elevated (+9% to 81 bpm)',
            'Heart Rate Variability reduced (-29% to 44 ms)',
            'Sleep duration decreased (-18% to 5h 54m)',
            'Subjective fatigue index elevated (68/100)'
          ],
          baselineComparison: 'Resting HR baseline 68-74 bpm (current: 81 bpm). Sleep baseline 7.2h (current: 5.9h). HRV baseline 62 ms (current: 44 ms).',
          triggerRationale: 'Synchronous autonomic sympathetic shift and sleep loss across 4 continuous measurement intervals.',
          recommendedNextStep: 'Complete today’s recovery check-in and review recent sleep and exercise data. Low-impact active recovery recommended.',
          source: 'HEALTH_ENGINE',
          acknowledged: false,
        },
        {
          id: 'alert-sol-182-sleep',
          sol: 182,
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          severity: 'YELLOW',
          category: 'SLEEP',
          title: 'Sleep Latency & Duration Shift',
          message: 'Sleep duration fell below 6.5 hours for 2 consecutive cycles.',
          contributingFactors: ['Sleep duration 6.1h vs baseline 7.2h'],
          baselineComparison: 'Sleep baseline 7h 12m',
          triggerRationale: 'Consecutive sub-optimal sleep volume',
          recommendedNextStep: 'Verify acoustic isolation and schedule blue-depleted light transition 90m prior to sleep.',
          source: 'DETERMINISTIC_RULE',
          acknowledged: true,
          acknowledgedAt: new Date(Date.now() - 1.8 * 24 * 60 * 60 * 1000).toISOString(),
        }
      ]);

      // Seed initial check-ins
      await db.checkIns.bulkPut([
        {
          id: 'checkin-sol-184',
          timestamp: new Date().toISOString(),
          sol: 184,
          crewId: 'sarah-chen',
          energy: 48,
          stress: 64,
          fatigue: 68,
          mood: 62,
          sleepQuality: 56,
          subjectiveNotes: 'Woke up feeling unrefreshed. Restless night in crew berth; ventilation fan felt louder than usual.',
          healthEngineAnalysis: 'Reported fatigue (68/100) corroborates the observed -18% sleep compression and -29% HRV depression.',
          synced: true,
        },
        {
          id: 'checkin-sol-183',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          sol: 183,
          crewId: 'sarah-chen',
          energy: 55,
          stress: 58,
          fatigue: 62,
          mood: 70,
          sleepQuality: 60,
          subjectiveNotes: 'Exercise completed on ARED. Mild shoulder soreness.',
          healthEngineAnalysis: 'Slight fatigue uptick. Cardiovascular recovery delayed.',
          synced: true,
        }
      ]);

      // Seed timeline events
      await db.timelineEvents.bulkPut([
        {
          id: 'timeline-1',
          timestamp: new Date().toISOString(),
          sol: 184,
          category: 'ALERTS',
          title: 'Alert: Multi-Metric Change Detected',
          description: 'Health Engine flagged concurrent deviation in Resting HR, HRV, Sleep, and Fatigue.',
          severity: 'ORANGE',
          metricSnippet: 'Resting HR: 81 bpm (+9%) | HRV: 44 ms (-29%)',
          synced: true,
        },
        {
          id: 'timeline-2',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          sol: 184,
          category: 'CHECK_IN',
          title: 'Daily Check-in Completed',
          description: 'Sol 184 subjective assessment logged by Commander Sarah Chen.',
          severity: 'YELLOW',
          metricSnippet: 'Fatigue: 68/100 | Stress: 64/100',
          synced: true,
        },
        {
          id: 'timeline-3',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          sol: 184,
          category: 'SLEEP',
          title: 'Sleep Session Logged',
          description: 'Sleep recorded via biometric sensor: 5h 54m (Quality: 58/100).',
          severity: 'YELLOW',
          metricSnippet: 'Duration: 5h 54m (-18% from baseline)',
          synced: true,
        },
        {
          id: 'timeline-4',
          timestamp: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
          sol: 183,
          category: 'EXERCISE',
          title: 'Exercise Protocol Executed',
          description: 'ARED resistive training session completed: 1,380 kg aggregate load.',
          severity: 'GREEN',
          metricSnippet: 'Duration: 110 min | Output: 180W',
          synced: true,
        },
        {
          id: 'timeline-5',
          timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
          sol: 183,
          category: 'AI',
          title: 'ASTRA AI Health Summary Generated',
          description: 'Automated 7-day retrospective prepared for crew review.',
          severity: 'GREEN',
          metricSnippet: 'Analyzed 72 biometric channels',
          synced: true,
        }
      ]);

      // Seed initial radiation measurements (Personal Dosimeter)
      await db.radiationMeasurements.bulkPut([
        {
          id: 'rad-sol-184-01',
          sol: 184,
          timestamp: new Date().toISOString(),
          measurementType: 'doseEquivalent',
          value: 0.46,
          unit: 'mSv',
          equivalent_mSv: 0.46,
          doseRate_uSv_h: 19.2,
          source: 'personal_dosimeter',
          instrumentId: 'RAD-CREW-01 (BION-IV)',
          missionPhase: 'Cruise',
          locationContext: 'Crew Quarters Berth 01',
          notes: 'Standard morning dosimeter readout. Deep space galactic cosmic ray background.',
          syncStatus: 'synced',
          synced: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'rad-sol-183-01',
          sol: 183,
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          measurementType: 'doseEquivalent',
          value: 0.44,
          unit: 'mSv',
          equivalent_mSv: 0.44,
          doseRate_uSv_h: 18.5,
          source: 'personal_dosimeter',
          instrumentId: 'RAD-CREW-01 (BION-IV)',
          missionPhase: 'Cruise',
          locationContext: 'Command Module Deck',
          notes: 'Nominal cruise phase reading.',
          syncStatus: 'synced',
          synced: true,
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'rad-sol-182-01',
          sol: 182,
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          measurementType: 'doseEquivalent',
          value: 0.48,
          unit: 'mSv',
          equivalent_mSv: 0.48,
          doseRate_uSv_h: 20.1,
          source: 'personal_dosimeter',
          instrumentId: 'RAD-CREW-01 (BION-IV)',
          missionPhase: 'Cruise',
          locationContext: 'Exercise Bay (ARED Station)',
          notes: 'Post-workout dosimeter check.',
          syncStatus: 'synced',
          synced: true,
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        }
      ]);
    }

    // Ensure no legacy demo medical reports or demo lab panel results pollute production database
    try {
      await targetDb.medicalReports.where('id').equals('rep-sol-175-biochem').delete();
      await targetDb.laboratoryResults.where('reportId').equals('rep-sol-175-biochem').delete();
      const legacyDemoLabIds = ['lab-1', 'lab-2', 'lab-3', 'lab-4', 'lab-5', 'lab-6', 'lab-7', 'lab-8'];
      for (const id of legacyDemoLabIds) {
        const item = await targetDb.laboratoryResults.get(id);
        if (item && (!item.reportId || item.reportId === 'rep-sol-175-biochem')) {
          await targetDb.laboratoryResults.delete(id);
        }
      }
    } catch {
      // Ignore migration cleanup errors
    }
  };

  try {
    try {
      await activeDbInstance.open();
      await populateData(activeDbInstance);
    } catch (nativeErr: any) {
      console.warn('[ASTRA DB] Native storage issue (' + (nativeErr?.name || nativeErr?.message) + '). Switching to in-memory fake-indexeddb...');
      const memDb = switchToInMemoryDatabase();
      await memDb.open();
      await populateData(memDb);
    }
  } catch (err) {
    console.warn('[ASTRA DB] Initialization fallback completed with note:', err);
  }
}
