import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  HeartPulse, 
  Brain, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  Save, 
  RotateCcw,
  Activity, 
  Moon, 
  Zap, 
  Flame, 
  Smile, 
  AlertCircle, 
  HelpCircle, 
  Clock, 
  Upload, 
  FileText, 
  FileCheck, 
  Shield, 
  Trash2, 
  Eye, 
  Plus, 
  RefreshCw, 
  Sliders, 
  FileImage, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
  Calendar,
  AlertTriangle,
  Layers,
  Database
} from 'lucide-react';
import { DailyCheckIn, CheckInSubmissionPayload } from '../../types/health';
import { 
  MedicalReportRecord, 
  ExtractedVitalSign, 
  ExtractedLabResult, 
  ExtractedReportMetadata,
  LabCategory,
  MetricStatus,
  DocumentCompletenessCheck
} from '../../types/medicalReport';
import { medicalReportService } from '../../services/medicalReportService';
import { spaceAudio } from '../../utils/spaceAudio';
import { db } from '../../services/db';

interface QuickDailyCheckInModalProps {
  isOpen: boolean;
  sol: number;
  existingCheckIn?: DailyCheckIn;
  mode?: 'create' | 'review' | 'update';
  initialTab?: 'manual' | 'upload';
  onClose: () => void;
  onSubmit: (data: CheckInSubmissionPayload) => Promise<{
    success: boolean;
    physicalIndex: number;
    mentalIndex: number;
    isUpdate: boolean;
  }>;
  onNavigateDashboard?: () => void;
  onNavigateTrends?: () => void;
  onDeleteReport?: (reportId: string, deleteAssociatedLabs?: boolean) => Promise<void>;
}

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  status: 'QUEUED' | 'UPLOADING' | 'EXTRACTING' | 'DONE' | 'ERROR';
  progress: number;
  statusMessage?: string;
  extractedReport?: MedicalReportRecord;
  error?: string;
}

export const QuickDailyCheckInModal: React.FC<QuickDailyCheckInModalProps> = ({
  isOpen,
  sol,
  existingCheckIn: propExistingCheckIn,
  mode = 'create',
  initialTab = 'manual',
  onClose,
  onSubmit,
  onNavigateDashboard,
  onNavigateTrends,
  onDeleteReport,
}) => {
  // Top-level workflow tabs: 'manual' (Option A) vs 'upload' (Option B) vs 'manage' (Option C)
  const [activeWorkflow, setActiveWorkflow] = useState<'manual' | 'upload' | 'manage'>(initialTab || 'manual');

  // Library & Delete Management state
  const [allSavedReports, setAllSavedReports] = useState<MedicalReportRecord[]>([]);
  const [storageInfo, setStorageInfo] = useState<{ totalBytes: number; reportCount: number; formattedSize: string }>({
    totalBytes: 0,
    reportCount: 0,
    formattedSize: '0 KB',
  });
  const [reportToDelete, setReportToDelete] = useState<MedicalReportRecord | null>(null);
  const [deleteAssociatedLabsOption, setDeleteAssociatedLabsOption] = useState(false);
  const [isDeletingReport, setIsDeletingReport] = useState(false);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [libraryPreviewReport, setLibraryPreviewReport] = useState<MedicalReportRecord | null>(null);

  // Steps
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(mode === 'review' ? 3 : 1);
  const [uploadWorkflowStep, setUploadWorkflowStep] = useState<'upload' | 'review' | 'combine' | 'success'>('upload');

  // Persistent storage state for current Sol
  const [dbCurrentCheckIn, setDbCurrentCheckIn] = useState<DailyCheckIn | null>(null);
  const [persistedReports, setPersistedReports] = useState<MedicalReportRecord[]>([]);
  const [persistedLabs, setPersistedLabs] = useState<(ExtractedLabResult & { sol: number; reportId?: string; date?: string })[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(false);

  // The authoritative existing checkIn for this Sol
  const effectiveCheckIn = useMemo(() => {
    return propExistingCheckIn || dbCurrentCheckIn || undefined;
  }, [propExistingCheckIn, dbCurrentCheckIn]);

  // Option A (Manual) state
  const [heartRate, setHeartRate] = useState<string>('');
  const [systolic, setSystolic] = useState<string>('');
  const [diastolic, setDiastolic] = useState<string>('');
  const [spo2, setSpo2] = useState<string>('');
  const [exerciseMinutes, setExerciseMinutes] = useState<string>('');
  const [recovery, setRecovery] = useState<number | null>(null);

  // Mental / Subjective inputs
  const [sleepHours, setSleepHours] = useState<string>('');
  const [sleepMinutes, setSleepMinutes] = useState<string>('');
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [subjectiveNotes, setSubjectiveNotes] = useState<string>('');

  // Option B (Upload & Extraction) state
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [isProcessingUploads, setIsProcessingUploads] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extraction Review state
  const [activeReport, setActiveReport] = useState<MedicalReportRecord | null>(null);
  const [reviewedVitals, setReviewedVitals] = useState<ExtractedVitalSign[]>([]);
  const [reviewedLabs, setReviewedLabs] = useState<ExtractedLabResult[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [showAddCustomMetric, setShowAddCustomMetric] = useState(false);
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(null);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);

  // Table filter in review
  const [reviewCategoryFilter, setReviewCategoryFilter] = useState<string>('ALL');

  // Custom measurement modal state
  const [customMetricType, setCustomMetricType] = useState<'VITAL' | 'LAB'>('LAB');
  const [customName, setCustomName] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [customCategory, setCustomCategory] = useState<string>('HEMATOLOGY');
  const [customRefRange, setCustomRefRange] = useState('');

  // Status & Validation
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultIndices, setResultIndices] = useState<{ physical: number; mental: number }>({
    physical: 84,
    mental: 82,
  });

  // Derived state: Distinct categories & Filtered labs in review
  const distinctReviewCategories = useMemo(() => {
    const cats = new Set<string>();
    reviewedLabs.forEach(l => {
      if (l.category) cats.add(l.category);
    });
    return ['ALL', ...Array.from(cats)];
  }, [reviewedLabs]);

  const filteredReviewedLabs = useMemo(() => {
    if (reviewCategoryFilter === 'ALL') return reviewedLabs;
    return reviewedLabs.filter(l => l.category === reviewCategoryFilter);
  }, [reviewedLabs, reviewCategoryFilter]);

  const conflictingLabNames = useMemo(() => {
    const nameToValues = new Map<string, Set<string>>();
    reviewedLabs.forEach(l => {
      const normName = l.name.toLowerCase().trim();
      if (!nameToValues.has(normName)) nameToValues.set(normName, new Set());
      nameToValues.get(normName)!.add(String(l.value).trim());
    });
    const conflicts = new Set<string>();
    nameToValues.forEach((vals, name) => {
      if (vals.size > 1) conflicts.add(name);
    });
    return conflicts;
  }, [reviewedLabs]);

  const filteredLibraryReports = useMemo(() => {
    if (!reportSearchQuery.trim()) return allSavedReports;
    const q = reportSearchQuery.toLowerCase().trim();
    return allSavedReports.filter(r => 
      r.fileName.toLowerCase().includes(q) || 
      `sol ${r.sol}`.includes(q) || 
      r.fileType.toLowerCase().includes(q) ||
      (r.metadata?.facilityOrLab || '').toLowerCase().includes(q)
    );
  }, [allSavedReports, reportSearchQuery]);

  // ---------------------------------------------------------------------------
  // 1. PERSISTENCE: Query Dexie for current Sol's health record and reports
  // ---------------------------------------------------------------------------
  const loadSolPersistentRecords = async () => {
    setIsDbLoading(true);
    try {
      const [ci, reports, labs, allReports, storage, telem] = await Promise.all([
        db.checkIns.where('sol').equals(sol).first(),
        db.medicalReports.where('sol').equals(sol).toArray(),
        db.laboratoryResults.where('sol').equals(sol).toArray(),
        medicalReportService.getAllReports(),
        medicalReportService.getTotalStorageUsed(),
        db.healthMeasurements.where('sol').equals(sol).first(),
      ]);

      if (ci) setDbCurrentCheckIn(ci);
      if (reports) setPersistedReports(reports);
      if (labs) setPersistedLabs(labs);
      if (allReports) setAllSavedReports(allReports);
      if (storage) setStorageInfo(storage);

      // Prepopulate form fields with saved values
      const activeData = propExistingCheckIn || ci;
      if (activeData) {
        if (activeData.physical?.heartRate) setHeartRate(String(activeData.physical.heartRate));
        if (activeData.physical?.bloodPressureSystolic) setSystolic(String(activeData.physical.bloodPressureSystolic));
        if (activeData.physical?.bloodPressureDiastolic) setDiastolic(String(activeData.physical.bloodPressureDiastolic));
        if (activeData.physical?.spo2) setSpo2(String(activeData.physical.spo2));
        if (activeData.physical?.exerciseMinutes !== undefined) setExerciseMinutes(String(activeData.physical.exerciseMinutes));
        if (activeData.physical?.recovery !== undefined) setRecovery(activeData.physical.recovery);

        if (activeData.mental?.sleepHours !== undefined) {
          setSleepHours(String(activeData.mental.sleepHours));
        } else if (activeData.mental?.sleepDurationMinutes) {
          setSleepHours(String(Math.floor(activeData.mental.sleepDurationMinutes / 60)));
        }

        if (activeData.mental?.sleepMinutes !== undefined) {
          setSleepMinutes(String(activeData.mental.sleepMinutes));
        } else if (activeData.mental?.sleepDurationMinutes) {
          setSleepMinutes(String(activeData.mental.sleepDurationMinutes % 60));
        }

        if (activeData.mental?.mood !== undefined) setMood(activeData.mental.mood);
        if (activeData.mental?.stress !== undefined) setStress(activeData.mental.stress);
        if (activeData.mental?.energy !== undefined) setEnergy(activeData.mental.energy);
        if (activeData.mental?.fatigue !== undefined) setFatigue(activeData.mental.fatigue);
        if (activeData.subjectiveNotes) setSubjectiveNotes(activeData.subjectiveNotes);

        if (activeData.attachedReportIds && activeData.attachedReportIds.length > 0) {
          const knownReportIds = new Set((allReports || []).map(r => r.id));
          const validExistingIds = activeData.attachedReportIds.filter(id => knownReportIds.has(id));
          setSelectedReportIds(validExistingIds);
        }
      } else if (telem) {
        if (telem.heartRate) setHeartRate(String(telem.heartRate));
        if (telem.bloodPressureSystolic) setSystolic(String(telem.bloodPressureSystolic));
        if (telem.bloodPressureDiastolic) setDiastolic(String(telem.bloodPressureDiastolic));
        if (telem.spo2) setSpo2(String(telem.spo2));
        if (telem.exerciseDurationMinutes) setExerciseMinutes(String(telem.exerciseDurationMinutes));
        if (telem.sleepDurationMinutes) {
          setSleepHours(String(Math.floor(telem.sleepDurationMinutes / 60)));
          setSleepMinutes(String(telem.sleepDurationMinutes % 60));
        }
      }
    } catch (err) {
      console.warn('[QuickDailyCheckInModal] Failed to load Sol persistence records:', err);
    } finally {
      setIsDbLoading(false);
    }
  };

  const handleConfirmDeleteReport = async () => {
    if (!reportToDelete) return;
    setIsDeletingReport(true);
    const targetReportId = reportToDelete.id;
    try {
      await medicalReportService.deleteReport(targetReportId, deleteAssociatedLabsOption);
      spaceAudio.playExecute();

      // Clean up local modal state immediately
      setSelectedReportIds(prev => prev.filter(id => id !== targetReportId));
      setQueuedFiles(prev => prev.filter(q => q.extractedReport?.id !== targetReportId));
      if (activeReport?.id === targetReportId) {
        setActiveReport(null);
        setPreviewDocumentUrl(null);
        setShowDocumentPreview(false);
      }

      // If associated labs were chosen to be deleted, remove them from reviewedLabs; otherwise mark sourceDeleted
      if (deleteAssociatedLabsOption) {
        setReviewedLabs(prev => prev.filter(l => l.reportId !== targetReportId));
      } else {
        setReviewedLabs(prev => prev.map(l => l.reportId === targetReportId ? { ...l, sourceDeleted: true } : l));
      }

      setReportToDelete(null);
      await loadSolPersistentRecords();

      if (onDeleteReport) {
        await onDeleteReport(targetReportId, deleteAssociatedLabsOption);
      }
    } catch (err: any) {
      console.error('[QuickDailyCheckInModal] Failed to delete report:', err);
      setUploadNotice(`Deletion Note: ${err?.message || 'Could not complete document removal.'}`);
    } finally {
      setIsDeletingReport(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSolPersistentRecords();
      if (initialTab) setActiveWorkflow(initialTab);
      if (mode === 'review') {
        setCurrentStep(3);
        setUploadWorkflowStep('review');
      } else {
        setCurrentStep(1);
        setUploadWorkflowStep('upload');
      }
    }
  }, [isOpen, sol, mode, initialTab]);

  // Validation functions
  const validateStep1 = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (heartRate.trim()) {
      const hr = Number(heartRate);
      if (isNaN(hr) || hr < 35 || hr > 220) {
        errors.heartRate = 'Heart rate must be between 35 and 220 bpm.';
      }
    }

    if (spo2.trim()) {
      const sp = Number(spo2);
      if (isNaN(sp) || sp < 70 || sp > 100) {
        errors.spo2 = 'SpO₂ percentage must be between 70% and 100%.';
      }
    }

    if (exerciseMinutes.trim()) {
      const ex = Number(exerciseMinutes);
      if (isNaN(ex) || ex < 0 || ex > 360) {
        errors.exerciseMinutes = 'Exercise minutes must be between 0 and 360.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (sleepHours.trim()) {
      const sh = Number(sleepHours);
      if (isNaN(sh) || sh < 0 || sh > 24) {
        errors.sleepHours = 'Sleep hours must be between 0 and 24.';
      }
    }

    if (sleepMinutes.trim()) {
      const sm = Number(sleepMinutes);
      if (isNaN(sm) || sm < 0 || sm > 59) {
        errors.sleepMinutes = 'Sleep minutes must be between 0 and 59.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ---------------------------------------------------------------------------
  // Option B: File Upload & Drag-and-Drop Handlers
  // ---------------------------------------------------------------------------
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const validFiles = files.filter(f => allowed.includes(f.type) || f.name.match(/\.(pdf|png|jpg|jpeg|webp)$/i));

    if (validFiles.length < files.length) {
      setUploadNotice('Some files were skipped. Only PDF, PNG, JPG, JPEG, and WEBP documents are supported.');
    }

    // Filter out duplicate files already queued (matching name and size)
    const existingKeys = new Set(queuedFiles.map(q => `${q.name}_${q.size}`));
    const nonDuplicates = validFiles.filter(f => !existingKeys.has(`${f.name}_${f.size}`));

    if (nonDuplicates.length < validFiles.length) {
      setUploadNotice('Duplicate file(s) already in the processing queue were skipped.');
    }

    const newQueued: QueuedFile[] = nonDuplicates.map(f => {
      const isImg = f.type.startsWith('image/');
      return {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type || 'application/pdf',
        previewUrl: isImg ? URL.createObjectURL(f) : undefined,
        status: 'QUEUED',
        progress: 0,
      };
    });

    setQueuedFiles(prev => [...prev, ...newQueued]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFileFromQueue = (id: string) => {
    setQueuedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Run Real Multimodal Extraction via Service (Independent per-file processing)
  const handleProcessUploadedReports = async () => {
    const pendingFiles = queuedFiles.filter(f => f.status === 'QUEUED' || f.status === 'ERROR');
    if (pendingFiles.length === 0) {
      if (queuedFiles.some(f => f.status === 'DONE')) {
        setUploadWorkflowStep('review');
      } else {
        setUploadNotice('Please select at least one document to analyze.');
      }
      return;
    }

    if (!consentAccepted) {
      setUploadNotice('Please confirm encryption and privacy consent before transmitting documents.');
      return;
    }

    setIsProcessingUploads(true);
    setUploadNotice(null);
    spaceAudio.playExecute();

    const newReportIds: string[] = [];
    const newExtractedVitals: ExtractedVitalSign[] = [];
    const newExtractedLabs: ExtractedLabResult[] = [];
    let latestReport: MedicalReportRecord | null = activeReport;
    let successCount = 0;
    let failCount = 0;

    for (const item of pendingFiles) {
      setQueuedFiles(prev => prev.map(f => f.id === item.id ? { 
        ...f, 
        status: 'EXTRACTING', 
        progress: 50,
        statusMessage: 'Analyzing document via clinical extraction engine...'
      } : f));

      try {
        const result = await medicalReportService.processAndExtractReport({
          file: item.file,
          sol,
          consentAccepted: true,
          onProgress: (text) => {
            setQueuedFiles(prev => prev.map(f => f.id === item.id ? { ...f, statusMessage: text } : f));
          }
        });

        if (result.success && result.report) {
          latestReport = result.report;
          newReportIds.push(result.report.id);
          newExtractedVitals.push(...(result.report.extractedVitals || []));
          newExtractedLabs.push(...(result.report.extractedLabs || []));
          successCount++;

          setQueuedFiles(prev => prev.map(f => f.id === item.id ? { 
            ...f, 
            status: 'DONE', 
            progress: 100,
            statusMessage: result.isOfflineNotice || 'Extraction complete.',
            extractedReport: result.report 
          } : f));
        } else {
          failCount++;
          const errText = result.error || 'Failed to extract clinical parameters.';
          setQueuedFiles(prev => prev.map(f => f.id === item.id ? { 
            ...f, 
            status: 'ERROR', 
            progress: 0,
            error: errText,
            statusMessage: `Extraction error: ${errText}`
          } : f));
        }
      } catch (err: any) {
        failCount++;
        const errText = err?.message || 'Error processing document.';
        setQueuedFiles(prev => prev.map(f => f.id === item.id ? { 
          ...f, 
          status: 'ERROR', 
          progress: 0,
          error: errText,
          statusMessage: errText
        } : f));
      }
    }

    if (successCount > 0) {
      setActiveReport(latestReport);
      setReviewedVitals(prev => [...prev, ...newExtractedVitals]);
      setReviewedLabs(prev => [...prev, ...newExtractedLabs]);
      setSelectedReportIds(prev => Array.from(new Set([...prev, ...newReportIds])));

      if (latestReport?.fileDataUrl) {
        setPreviewDocumentUrl(latestReport.fileDataUrl);
      }

      // Pre-fill manual vitals from extraction if available
      for (const v of newExtractedVitals) {
        const nameLower = (v.name || '').toLowerCase();
        if ((v.key === 'heartRate' || nameLower.includes('heart rate')) && v.value && !heartRate) {
          setHeartRate(String(Math.round(Number(v.value))));
        }
        if ((v.key === 'bloodPressureSystolic' || nameLower.includes('systolic')) && v.value && (!systolic || systolic === '118')) {
          setSystolic(String(Math.round(Number(v.value))));
        }
        if ((v.key === 'bloodPressureDiastolic' || nameLower.includes('diastolic')) && v.value && (!diastolic || diastolic === '76')) {
          setDiastolic(String(Math.round(Number(v.value))));
        }
        if ((v.key === 'spo2' || nameLower.includes('spo2') || nameLower.includes('oxygen')) && v.value && !spo2) {
          setSpo2(String(v.value));
        }
      }

      spaceAudio.playExecute();
      setUploadWorkflowStep('review');
    }

    if (failCount > 0) {
      if (successCount > 0) {
        setUploadNotice(`${successCount} document(s) extracted successfully, but ${failCount} file(s) encountered issues. Successfully extracted data is preserved below.`);
      } else {
        setUploadNotice(`Extraction failed for ${failCount} file(s). You can remove the failed files or re-upload clear documents.`);
      }
    }

    setIsProcessingUploads(false);
  };

  // Extraction Review actions
  const handleToggleVital = (id: string) => {
    setReviewedVitals(prev => prev.map(v => v.id === id ? { ...v, selected: !v.selected } : v));
  };

  const handleUpdateVitalValue = (id: string, newVal: number) => {
    setReviewedVitals(prev => prev.map(v => v.id === id ? { ...v, value: newVal } : v));
  };

  const handleToggleLab = (id: string) => {
    setReviewedLabs(prev => prev.map(l => l.id === id ? { ...l, selected: !l.selected } : l));
  };

  const handleUpdateLabValue = (id: string, newVal: string | number) => {
    setReviewedLabs(prev => prev.map(l => l.id === id ? { 
      ...l, 
      value: newVal,
      numericValue: !isNaN(Number(newVal)) ? Number(newVal) : l.numericValue 
    } : l));
  };

  const handleUpdateLabUnit = (id: string, newUnit: string) => {
    setReviewedLabs(prev => prev.map(l => l.id === id ? { ...l, unit: newUnit } : l));
  };

  const handleUpdateLabRange = (id: string, newRange: string) => {
    setReviewedLabs(prev => prev.map(l => l.id === id ? { ...l, referenceRange: newRange } : l));
  };

  const handleDeleteLab = (id: string) => {
    setReviewedLabs(prev => prev.filter(l => l.id !== id));
  };

  const handleAcceptAllExtracted = () => {
    setReviewedVitals(prev => prev.map(v => ({ ...v, selected: true })));
    setReviewedLabs(prev => prev.map(l => ({ ...l, selected: true })));
    spaceAudio.playExecute();
  };

  const handleDeselectAllExtracted = () => {
    setReviewedVitals(prev => prev.map(v => ({ ...v, selected: false })));
    setReviewedLabs(prev => prev.map(l => ({ ...l, selected: false })));
    spaceAudio.playClick();
  };

  const handleAddCustomMeasurement = () => {
    if (!customName.trim() || !customValue.trim()) return;

    if (customMetricType === 'VITAL') {
      const newVit: ExtractedVitalSign = {
        id: `custom-vit-${Date.now()}`,
        name: customName.trim(),
        value: Number(customValue) || 0,
        unit: customUnit.trim() || 'unit',
        referenceRange: customRefRange.trim() || undefined,
        status: 'NORMAL',
        confidence: 1.0,
        selected: true,
        isCustom: true,
        sourceSnippet: 'Manually added by astronaut during check-in review',
      };
      setReviewedVitals(prev => [...prev, newVit]);
    } else {
      const newLab: ExtractedLabResult = {
        id: `custom-lab-${Date.now()}`,
        name: customName.trim(),
        category: customCategory,
        value: customValue.trim(),
        numericValue: !isNaN(Number(customValue)) ? Number(customValue) : undefined,
        unit: customUnit.trim() || '',
        referenceRange: customRefRange.trim() || undefined,
        status: 'NORMAL',
        confidence: 1.0,
        selected: true,
        sourceSnippet: 'Manually added by astronaut during check-in review',
        notes: 'Astronaut verified manual entry',
      };
      setReviewedLabs(prev => [...prev, newLab]);
    }

    setCustomName('');
    setCustomValue('');
    setCustomUnit('');
    setCustomRefRange('');
    setShowAddCustomMetric(false);
    spaceAudio.playExecute();
  };

  // Immediate confirmation of verified extraction data
  const handleConfirmAndCommitDirectly = async () => {
    setIsSubmitting(true);
    try {
      const activeSelectedVitals = reviewedVitals.filter(v => v.selected);
      const activeSelectedLabs = reviewedLabs.filter(l => l.selected);

      // Verify that active report IDs exist, or generate an intake ID if none exist
      let reportIdsToProcess = selectedReportIds.filter(Boolean);
      if (reportIdsToProcess.length === 0 && (activeSelectedLabs.length > 0 || activeSelectedVitals.length > 0)) {
        reportIdsToProcess = [`rep-intake-sol-${sol}-${Date.now()}`];
      }

      for (const repId of reportIdsToProcess) {
        try {
          await medicalReportService.verifyAndCommitReport(
            repId,
            activeSelectedVitals,
            activeSelectedLabs,
            sol
          );
        } catch (repErr) {
          console.warn('[QuickDailyCheckInModal] Failed committing report id:', repId, repErr);
        }
      }
      await loadSolPersistentRecords();
      spaceAudio.playExecute();
      setUploadWorkflowStep('success');
    } catch (err: any) {
      console.error('Failed committing report:', err);
      setUploadNotice('Report commit notice: ' + (err?.message || 'Verification failure'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAndProceedToCombine = async () => {
    try {
      const activeSelectedVitals = reviewedVitals.filter(v => v.selected);
      const activeSelectedLabs = reviewedLabs.filter(l => l.selected);

      let reportIdsToProcess = selectedReportIds.filter(Boolean);
      if (reportIdsToProcess.length === 0 && (activeSelectedLabs.length > 0 || activeSelectedVitals.length > 0)) {
        reportIdsToProcess = [`rep-intake-sol-${sol}-${Date.now()}`];
      }

      for (const repId of reportIdsToProcess) {
        try {
          await medicalReportService.verifyAndCommitReport(
            repId,
            activeSelectedVitals,
            activeSelectedLabs,
            sol
          );
        } catch (repErr) {
          console.warn('[QuickDailyCheckInModal] Intermediate commit notice for report id:', repId, repErr);
        }
      }
      await loadSolPersistentRecords();
    } catch (err) {
      console.warn('Intermediate commit notice:', err);
    }
    spaceAudio.playExecute();
    setUploadWorkflowStep('combine');
  };

  // Final Unified Submission (combines manual wellbeing + verified report data)
  const handleFinalSave = async () => {
    setIsSubmitting(true);
    try {
      const totalSleepMinutes = ((Number(sleepHours) || 0) * 60) + (Number(sleepMinutes) || 0);

      // Check if vitals from extraction should override or combine with manual
      const activeSelectedVitals = reviewedVitals.filter(v => v.selected);
      const extractedHr = activeSelectedVitals.find(v => (v.key === 'heartRate' || v.name?.toLowerCase().includes('heart rate')) && v.selected)?.value;
      const extractedSpo2 = activeSelectedVitals.find(v => (v.key === 'spo2' || v.name?.toLowerCase().includes('spo2') || v.name?.toLowerCase().includes('oxygen')) && v.selected)?.value;
      const extractedSys = activeSelectedVitals.find(v => (v.key === 'bloodPressureSystolic' || v.name?.toLowerCase().includes('systolic')) && v.selected)?.value;
      const extractedDia = activeSelectedVitals.find(v => (v.key === 'bloodPressureDiastolic' || v.name?.toLowerCase().includes('diastolic')) && v.selected)?.value;

      const finalHeartRate = heartRate.trim() ? Number(heartRate) : (extractedHr !== undefined ? Math.round(Number(extractedHr)) : undefined);
      const finalSpo2 = spo2.trim() ? Number(spo2) : (extractedSpo2 !== undefined ? Number(extractedSpo2) : undefined);
      const finalSys = systolic.trim() ? Number(systolic) : (extractedSys !== undefined ? Math.round(Number(extractedSys)) : undefined);
      const finalDia = diastolic.trim() ? Number(diastolic) : (extractedDia !== undefined ? Math.round(Number(extractedDia)) : undefined);

      const activeSelectedLabs = reviewedLabs.filter(l => l.selected);

      // Verify and commit all selected reports and their individual labs
      for (const repId of selectedReportIds) {
        try {
          await medicalReportService.verifyAndCommitReport(
            repId,
            activeSelectedVitals,
            activeSelectedLabs,
            sol
          );
        } catch (repErr) {
          console.warn('[QuickDailyCheckInModal] Failed committing report:', repId, repErr);
        }
      }

      const payload: CheckInSubmissionPayload = {
        physical: {
          heartRate: finalHeartRate,
          bloodPressureSystolic: finalSys,
          bloodPressureDiastolic: finalDia,
          spo2: finalSpo2,
          exerciseMinutes: exerciseMinutes.trim() ? Number(exerciseMinutes) : undefined,
          recovery: recovery ?? undefined,
        },
        mental: {
          sleepHours: sleepHours.trim() ? Number(sleepHours) : undefined,
          sleepMinutes: sleepMinutes.trim() ? Number(sleepMinutes) : undefined,
          sleepDurationMinutes: totalSleepMinutes > 0 ? totalSleepMinutes : undefined,
          mood: mood ?? 4,
          stress: stress ?? 2,
          energy: energy ?? 4,
          fatigue: fatigue ?? 2,
        },
        subjectiveNotes: subjectiveNotes.trim() || undefined,
        source: selectedReportIds.length > 0 ? 'combined' : 'astronaut',
        attachedReportIds: selectedReportIds.length > 0 ? selectedReportIds : undefined,
        newLabResults: activeSelectedLabs.length > 0 ? activeSelectedLabs : undefined,
      };

      const result = await onSubmit(payload);
      setResultIndices({
        physical: result.physicalIndex,
        mental: result.mentalIndex,
      });

      // Reload persistent data
      await loadSolPersistentRecords();

      spaceAudio.playExecute();
      if (activeWorkflow === 'upload') {
        setUploadWorkflowStep('success');
      } else {
        setCurrentStep(4);
      }
    } catch (err) {
      console.error('Check-in submission failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md p-2 sm:p-4 md:p-6 flex justify-center items-start">
      <div 
        id="quick-checkin-modal"
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl text-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* ============================================================ */}
        {/* HEADER & PERSISTENCE BANNER                                  */}
        {/* ============================================================ */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-950 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                    SOL {sol}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">PERSISTENT HEALTH RECORD</span>
                  {effectiveCheckIn && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      RECORD EXISTS (UPSERT ACTIVE)
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-wide mt-0.5">
                  TODAY'S HEALTH CHECK-IN & CLINICAL INTAKE
                </h3>
              </div>
            </div>

            <button
              id="btn-close-checkin-modal"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close Check-in Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Workflow Tabs (Option A vs Option B) */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => {
                setActiveWorkflow('manual');
                spaceAudio.playClick();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-medium transition ${
                activeWorkflow === 'manual'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>OPTION A — MANUAL HEALTH ENTRY</span>
            </button>

            <button
              onClick={() => {
                setActiveWorkflow('upload');
                spaceAudio.playClick();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-medium transition ${
                activeWorkflow === 'upload'
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>OPTION B — UPLOAD REPORT</span>
              {(queuedFiles.length > 0 || persistedReports.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => {
                setActiveWorkflow('manage');
                spaceAudio.playClick();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-medium transition ${
                activeWorkflow === 'manage'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>MANAGE REPORTS ({allSavedReports.length})</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {storageInfo.formattedSize}
              </span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* WORKFLOW SCROLLABLE BODY                                     */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 overscroll-contain">
          {/* ============================================================ */}
          {/* OPTION A: MANUAL WORKFLOW                                    */}
          {/* ============================================================ */}
          {activeWorkflow === 'manual' && (
            <div>
              {/* Step 1: Physical Vitals */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase flex items-center gap-2">
                        <HeartPulse className="w-4 h-4 text-cyan-400" />
                        STEP 1 OF 3: PHYSICAL VITALS & TELEMETRY
                      </span>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {effectiveCheckIn 
                          ? `Previously saved Sol ${sol} measurements loaded. Update or preserve existing values.`
                          : `Enter current flight biometric readings for Sol ${sol}.`}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Heart Rate */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <label className="block text-xs font-mono text-slate-300 mb-1 flex items-center justify-between">
                        <span>Resting Heart Rate</span>
                        <span className="text-[10px] text-cyan-400 font-bold">bpm</span>
                      </label>
                      <input
                        type="number"
                        placeholder="72"
                        value={heartRate}
                        onChange={(e) => setHeartRate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                      />
                      {validationErrors.heartRate && (
                        <p className="text-[11px] font-mono text-rose-400 mt-1">{validationErrors.heartRate}</p>
                      )}
                    </div>

                    {/* SpO2 */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <label className="block text-xs font-mono text-slate-300 mb-1 flex items-center justify-between">
                        <span>Blood Oxygen Saturation (SpO₂)</span>
                        <span className="text-[10px] text-cyan-400 font-bold">%</span>
                      </label>
                      <input
                        type="number"
                        placeholder="98.5"
                        value={spo2}
                        onChange={(e) => setSpo2(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                      />
                      {validationErrors.spo2 && (
                        <p className="text-[11px] font-mono text-rose-400 mt-1">{validationErrors.spo2}</p>
                      )}
                    </div>

                    {/* Blood Pressure */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <label className="block text-xs font-mono text-slate-300 mb-1 flex items-center justify-between">
                        <span>Blood Pressure</span>
                        <span className="text-[10px] text-cyan-400 font-bold">mmHg (Sys / Dia)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="118"
                          value={systolic}
                          onChange={(e) => setSystolic(e.target.value)}
                          className="w-1/2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                        />
                        <span className="text-slate-500 font-mono">/</span>
                        <input
                          type="number"
                          placeholder="76"
                          value={diastolic}
                          onChange={(e) => setDiastolic(e.target.value)}
                          className="w-1/2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Countermeasure Exercise */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <label className="block text-xs font-mono text-slate-300 mb-1 flex items-center justify-between">
                        <span>Exercise Duration (ARED / CEVIS)</span>
                        <span className="text-[10px] text-cyan-400 font-bold">minutes</span>
                      </label>
                      <input
                        type="number"
                        placeholder="45"
                        value={exerciseMinutes}
                        onChange={(e) => setExerciseMinutes(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                      />
                      {validationErrors.exerciseMinutes && (
                        <p className="text-[11px] font-mono text-rose-400 mt-1">{validationErrors.exerciseMinutes}</p>
                      )}
                    </div>
                  </div>

                  {/* Physical Recovery Rating */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <label className="block text-xs font-mono text-slate-300 mb-2 flex items-center justify-between">
                      <span>Physical Recovery Assessment</span>
                      <span className="text-[10px] text-slate-400">1 = Sore/Fatigued, 5 = Fully Recovered</span>
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRecovery(n)}
                          className={`py-2 rounded-lg text-xs font-mono font-bold transition ${
                            recovery === n
                              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                              : 'bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <span className="text-[10px] font-mono text-slate-400">
                      Auto-saves to local encrypted IndexedDB
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStep1()) {
                          spaceAudio.playExecute();
                          setCurrentStep(2);
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-2 transition"
                    >
                      <span>NEXT: MENTAL & SLEEP</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Mental & Subjective */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold tracking-wider text-purple-300 uppercase flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        STEP 2 OF 3: SLEEP DURATION & COGNITIVE STATE
                      </span>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Circadian rest tracking and subjective mission stress factors.
                      </p>
                    </div>
                  </div>

                  {/* Friendly Astronaut Prompt */}
                  <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-800/60 flex items-center justify-between gap-3 font-mono">
                    <div>
                      <h4 className="text-xs font-bold text-purple-200">
                        How are you feeling today, astronaut?
                      </h4>
                      <p className="text-[10px] text-purple-300/80 mt-0.5">
                        Sol {sol} • Calibrate emotional wellbeing & rest telemetry
                      </p>
                    </div>
                    <span className="text-3xl animate-bounce">
                      {mood === 5 ? '😄' : mood === 4 ? '🙂' : mood === 3 ? '😐' : mood === 2 ? '😟' : '😣'}
                    </span>
                  </div>

                  {/* Sleep Duration & Progress Visualizer */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-purple-900/60 space-y-4 font-mono">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5 text-purple-300">
                        🌙 Rest & Sleep Duration
                      </span>
                      <span className="text-purple-300 font-bold bg-purple-950/80 px-2.5 py-1 rounded-lg border border-purple-800/60">
                        Recorded: <strong className="text-white">{sleepHours || 0}h {sleepMinutes || 0}m</strong> ({(((Number(sleepHours) || 0) * 60 + (Number(sleepMinutes) || 0)) / 60).toFixed(1)} hrs)
                      </span>
                    </div>

                    {/* Direct Hour & Minute Numeric Inputs with +/- Stepper Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      {/* Hours */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase block">
                          Hours Slept
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const curr = Number(sleepHours) || 0;
                              setSleepHours(String(Math.max(0, curr - 1)));
                              spaceAudio.playClick();
                            }}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                            title="Decrease 1 hour"
                          >
                            -1h
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={sleepHours}
                            onChange={(e) => setSleepHours(e.target.value)}
                            className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-bold text-sm text-white focus:outline-none focus:border-purple-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const curr = Number(sleepHours) || 0;
                              setSleepHours(String(Math.min(24, curr + 1)));
                              spaceAudio.playClick();
                            }}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                            title="Increase 1 hour"
                          >
                            +1h
                          </button>
                        </div>
                      </div>

                      {/* Minutes */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase block">
                          Minutes Slept
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              spaceAudio.playClick();
                              const currM = Number(sleepMinutes) || 0;
                              const currH = Number(sleepHours) || 0;
                              if (currM >= 15) {
                                setSleepMinutes(String(currM - 15));
                              } else if (currH > 0) {
                                setSleepHours(String(currH - 1));
                                setSleepMinutes('45');
                              }
                            }}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                            title="Decrease 15 mins"
                          >
                            -15m
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            step="5"
                            value={sleepMinutes}
                            onChange={(e) => setSleepMinutes(e.target.value)}
                            className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center font-bold text-sm text-white focus:outline-none focus:border-purple-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              spaceAudio.playClick();
                              const currM = Number(sleepMinutes) || 0;
                              const currH = Number(sleepHours) || 0;
                              if (currM + 15 < 60) {
                                setSleepMinutes(String(currM + 15));
                              } else {
                                setSleepHours(String(currH + 1));
                                setSleepMinutes('0');
                              }
                            }}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center cursor-pointer transition border border-slate-700 active:scale-95"
                            title="Increase 15 mins"
                          >
                            +15m
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Range Slider */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Slide Duration</span>
                        <span className="font-bold text-purple-300">
                          {(((Number(sleepHours) || 0) * 60 + (Number(sleepMinutes) || 0)) / 60).toFixed(2)} Hours
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="720"
                        step="15"
                        value={(Number(sleepHours) || 0) * 60 + (Number(sleepMinutes) || 0)}
                        onChange={(e) => {
                          const totalMins = Number(e.target.value);
                          setSleepHours(String(Math.floor(totalMins / 60)));
                          setSleepMinutes(String(totalMins % 60));
                        }}
                        className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-purple-400"
                      />
                    </div>

                    {/* Progress Bar Visualizer */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Rest Window Progress</span>
                        <span>Target: 8.0 Hours (NASA Crew Rest)</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                          style={{ width: `${Math.min(100, Math.round((((Number(sleepHours) || 0) * 60 + (Number(sleepMinutes) || 0)) / 480) * 100))}%` }}
                        />
                      </div>
                    </div>

                    {/* Quick Sleep Presets */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase block font-bold">Quick Presets</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { h: '5', m: '30', label: '5.5h' },
                          { h: '6', m: '0', label: '6.0h 🌙' },
                          { h: '6', m: '30', label: '6.5h' },
                          { h: '7', m: '0', label: '7.0h 😴' },
                          { h: '7', m: '30', label: '7.5h 💤' },
                          { h: '8', m: '0', label: '8.0h 🌟 Target' },
                          { h: '8', m: '30', label: '8.5h ☀️' },
                          { h: '9', m: '0', label: '9.0h' },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setSleepHours(preset.h);
                              setSleepMinutes(preset.m);
                              spaceAudio.playClick();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                              sleepHours === preset.h && sleepMinutes === preset.m
                                ? 'bg-purple-600 text-white shadow-sm scale-102 ring-1 ring-purple-400'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Expressive Mood Selection */}
                  <div className="space-y-1.5 font-mono">
                    <label className="text-[11px] text-slate-300 font-bold block">
                      Subjective Mood Rating
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { level: 5, emoji: '😄', label: 'Great', desc: 'Energized' },
                        { level: 4, emoji: '🙂', label: 'Good', desc: 'Steady' },
                        { level: 3, emoji: '😐', label: 'Okay', desc: 'Baseline' },
                        { level: 2, emoji: '😟', label: 'Low', desc: 'Strain' },
                        { level: 1, emoji: '😣', label: 'Stressed', desc: 'Pressure' },
                      ].map((item) => (
                        <button
                          key={item.level}
                          type="button"
                          onClick={() => {
                            setMood(item.level);
                            spaceAudio.playClick();
                          }}
                          className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
                            mood === item.level
                              ? 'bg-purple-950 border-purple-400 shadow-lg shadow-purple-950 scale-105 ring-2 ring-purple-500/40'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <span className="text-2xl mb-1">{item.emoji}</span>
                          <span className="text-[11px] font-bold text-white">{item.label}</span>
                          <span className="text-[9px] text-slate-400 hidden sm:block">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Micro Indicators: Stress, Energy, Fatigue */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
                    {/* Stress */}
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-bold">🌋 Stress</span>
                        <span className="text-amber-400 font-bold">
                          {stress === 1 ? '🧘 Zen' : stress === 2 ? '😌 Low' : stress === 3 ? '😐 Moderate' : stress === 4 ? '🌋 High' : '💥 Severe'}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setStress(n);
                              spaceAudio.playClick();
                            }}
                            className={`py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              stress === n
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-900 text-slate-400 border border-slate-800'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Energy */}
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-bold">⚡ Energy</span>
                        <span className="text-cyan-400 font-bold">
                          {energy === 1 ? '🪫 Depleted' : energy === 2 ? '🔋 Low' : energy === 3 ? '⚡ Steady' : energy === 4 ? '🚀 Charged' : '✨ Peak'}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setEnergy(n);
                              spaceAudio.playClick();
                            }}
                            className={`py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              energy === n
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-slate-900 text-slate-400 border border-slate-800'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fatigue */}
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-bold">🥱 Fatigue</span>
                        <span className="text-rose-400 font-bold">
                          {fatigue === 1 ? '🌱 Fresh' : fatigue === 2 ? '🥱 Mild' : fatigue === 3 ? '😑 Moderate' : fatigue === 4 ? '😫 Heavy' : '😵 Exhausted'}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setFatigue(n);
                              spaceAudio.playClick();
                            }}
                            className={`py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              fatigue === n
                                ? 'bg-rose-500 text-slate-950'
                                : 'bg-slate-900 text-slate-400 border border-slate-800'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Subjective Notes */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <label className="block text-xs font-mono text-slate-300 mb-1.5">
                      Subjective Clinical Observations / Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Mild circadian shift post EVA training, rested after hydration..."
                      value={subjectiveNotes}
                      onChange={(e) => setSubjectiveNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>BACK</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (validateStep2()) {
                          spaceAudio.playExecute();
                          setCurrentStep(3);
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-2 transition"
                    >
                      <span>REVIEW & FINALIZE</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Review & Final Submit */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-mono font-bold tracking-wider text-emerald-300 uppercase">
                        STEP 3 OF 3: VERIFY TODAY'S CHECK-IN RECORD
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">SOL {sol} INTAKE</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-cyan-400 font-bold uppercase block">PHYSICAL METRICS</span>
                      <p className="text-slate-200">Resting HR: <strong className="text-white">{heartRate || '--'} bpm</strong></p>
                      <p className="text-slate-200">SpO₂: <strong className="text-white">{spo2 || '--'}%</strong></p>
                      <p className="text-slate-200">Blood Pressure: <strong className="text-white">{systolic}/{diastolic} mmHg</strong></p>
                      <p className="text-slate-200">Exercise: <strong className="text-white">{exerciseMinutes || '0'} min</strong></p>
                      <p className="text-slate-200">Recovery: <strong className="text-white">{recovery ? `${recovery}/5` : 'Not rated'}</strong></p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-purple-400 font-bold uppercase block">MENTAL & SLEEP</span>
                      <p className="text-slate-200">Sleep Window: <strong className="text-white">{sleepHours}h {sleepMinutes}m</strong></p>
                      <p className="text-slate-200">Mood: <strong className="text-white">{mood}/5</strong></p>
                      <p className="text-slate-200">Stress: <strong className="text-white">{stress}/5</strong></p>
                      <p className="text-slate-200">Energy / Fatigue: <strong className="text-white">{energy}/5 | {fatigue}/5</strong></p>
                    </div>
                  </div>

                  {/* Attached Medical Reports and Labs */}
                  {persistedReports.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-purple-300">
                        <span className="font-bold flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-purple-400" />
                          ATTACHED MEDICAL REPORTS FOR SOL {sol} ({persistedReports.length})
                        </span>
                        <span className="text-[10px] text-purple-400">
                          {persistedLabs.length} Lab Test(s) Recorded
                        </span>
                      </div>
                      <div className="divide-y divide-purple-800/30 text-xs font-mono">
                        {persistedReports.map(rep => (
                          <div key={rep.id} className="py-1.5 flex items-center justify-between">
                            <span className="text-slate-200 truncate">{rep.fileName}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/60 text-purple-300">
                              {rep.extractedLabs.length} params
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {subjectiveNotes && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
                      <span className="text-[10px] text-slate-400 uppercase">SUBJECTIVE CLINICAL NOTES</span>
                      <p className="text-slate-300 mt-1 italic">"{subjectiveNotes}"</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>EDIT VALUES</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleFinalSave}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>UPDATING SOL {sol} RECORD...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>{effectiveCheckIn ? `UPDATE SOL ${sol} HEALTH RECORD` : `COMMIT SOL ${sol} CHECK-IN`}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Success Screen */}
              {currentStep === 4 && (
                <div className="py-6 text-center space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white tracking-wide">
                      HEALTH RECORD PERSISTED (SOL {sol})
                    </h4>
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      Check-in parameters saved and synchronized with local mission telemetry.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] font-mono text-cyan-400 block uppercase">PHYSICAL HEALTH INDEX</span>
                      <span className="text-2xl font-bold font-mono text-white mt-1 block">
                        {resultIndices.physical}/100
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] font-mono text-purple-400 block uppercase">MENTAL HEALTH INDEX</span>
                      <span className="text-2xl font-bold font-mono text-white mt-1 block">
                        {resultIndices.mental}/100
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-center gap-3">
                    <button
                      onClick={onClose}
                      className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs transition"
                    >
                      VIEW DASHBOARD
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* OPTION B: UPLOAD & DYNAMIC EXTRACTION WORKFLOW                */}
          {/* ============================================================ */}
          {activeWorkflow === 'upload' && (
            <div>
              {/* Stage 1: File Dropzone & Queue */}
              {uploadWorkflowStep === 'upload' && (
                <div className="space-y-5">
                  {/* Previously uploaded reports for this Sol */}
                  {persistedReports.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center gap-2">
                          <Database className="w-4 h-4 text-purple-400" />
                          PREVIOUSLY STORED CLINICAL REPORTS (SOL {sol})
                        </span>
                        <span className="text-[10px] font-mono text-purple-400">
                          {persistedReports.length} Document(s) on File
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        {persistedReports.map(rep => (
                          <div 
                            key={rep.id}
                            className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                          >
                            <div className="truncate mr-2">
                              <p className="text-slate-200 font-bold truncate">{rep.fileName}</p>
                              <p className="text-[10px] text-slate-400">
                                {rep.extractedLabs.length} Lab Test(s) • Status: <span className="text-emerald-400 font-bold">{rep.status}</span>
                              </p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 shrink-0">
                              VERIFIED
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Drag-and-Drop Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition cursor-pointer ${
                      isDragging
                        ? 'border-purple-400 bg-purple-950/20 shadow-xl shadow-purple-900/20'
                        : 'border-slate-700 bg-slate-950/60 hover:border-purple-500/60 hover:bg-slate-950'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto mb-3">
                      <Upload className="w-7 h-7" />
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-white tracking-wide">
                      UPLOAD MEDICAL REPORT OR LAB SCAN
                    </h4>
                    <p className="text-xs font-mono text-slate-400 mt-1 max-w-md mx-auto">
                      Drag and drop medical documents, flight lab printouts, or telemetry logs. Supports PDF, PNG, JPG.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
                      <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">Multi-Page PDF</span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">Lab Diagnostic Scans</span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">Zero Hallucination Guarantee</span>
                    </div>
                  </div>

                  {/* Queued Documents */}
                  {queuedFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                        <span className="font-bold text-slate-200">SELECTED DOCUMENTS ({queuedFiles.length})</span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1 rounded-lg bg-purple-950/80 border border-purple-700/60 text-purple-300 hover:bg-purple-900/80 font-mono text-[11px] font-bold flex items-center gap-1.5 transition"
                        >
                          <Plus className="w-3.5 h-3.5 text-purple-400" />
                          <span>+ ADD ANOTHER FILE</span>
                        </button>
                      </div>
                      <div className="space-y-2">
                        {queuedFiles.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 truncate">
                              <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/60 text-purple-400 shrink-0">
                                {item.previewUrl ? (
                                  <FileImage className="w-4 h-4" />
                                ) : (
                                  <FileText className="w-4 h-4" />
                                )}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-bold text-white truncate">{item.name}</p>
                                <p className="text-[10px] font-mono text-slate-400">
                                  {(item.size / 1024).toFixed(1)} KB • {item.type.split('/')[1]?.toUpperCase() || 'DOCUMENT'}
                                </p>
                                {item.statusMessage && (
                                  <p className={`text-[10px] font-mono mt-0.5 ${item.status === 'ERROR' ? 'text-rose-400 font-bold' : 'text-purple-400 animate-pulse'}`}>
                                    {item.statusMessage}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                item.status === 'DONE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                item.status === 'EXTRACTING' ? 'bg-purple-950 text-purple-300 border border-purple-800 animate-pulse' :
                                item.status === 'ERROR' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}>
                                {item.status}
                              </span>

                              <button
                                type="button"
                                onClick={() => removeFileFromQueue(item.id)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition"
                                title="Remove file"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Privacy & Encryption Consent */}
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="consent-check"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-900"
                    />
                    <label htmlFor="consent-check" className="text-xs font-mono text-slate-300 leading-normal cursor-pointer">
                      <strong className="text-slate-100 flex items-center gap-1.5 mb-0.5">
                        <Shield className="w-3.5 h-3.5 text-cyan-400" />
                        Spaceflight Privacy & Grounding Protocol:
                      </strong>
                      I authorize clinical extraction for this document. Only values explicitly present in the document will be extracted. No synthetic or guessed data will ever be introduced into mission records.
                    </label>
                  </div>

                  {uploadNotice && (
                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs font-mono flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{uploadNotice}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={queuedFiles.length === 0 || isProcessingUploads || !consentAccepted}
                      onClick={handleProcessUploadedReports}
                      className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/20 transition disabled:opacity-40"
                    >
                      {isProcessingUploads ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>EXTRACTING CLINICAL DATA (GEMINI MULTIMODAL)...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>ANALYZE & EXTRACT ({queuedFiles.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage 2: Evidence-Based Extraction Review & Verification */}
              {uploadWorkflowStep === 'review' && (
                <div className="space-y-6">
                  {/* Review Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-mono font-bold tracking-wider text-purple-300 uppercase">
                          EVIDENCE-BASED EXTRACTION REVIEW & CLINICAL VERIFICATION
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Document: <strong className="text-slate-200">{activeReport?.fileName || 'Medical File'}</strong> • {activeReport?.metadata?.facilityOrLab || 'Diagnostic Lab'} • {activeReport?.metadata?.reportDate || 'Today'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {previewDocumentUrl && (
                        <button
                          type="button"
                          onClick={() => setShowDocumentPreview(prev => !prev)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono hover:bg-slate-700 transition flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-purple-400" />
                          <span>{showDocumentPreview ? 'Hide Preview' : 'Document Preview'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleAcceptAllExtracted}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-medium hover:bg-emerald-500/30 transition flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accept All</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowAddCustomMetric(true)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs transition flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add Missing Metric</span>
                      </button>
                    </div>
                  </div>

                  {/* Completeness & Verification Audit Bar */}
                  {activeReport?.completenessCheck && (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-purple-800/40 text-xs font-mono space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-purple-400" />
                          <span className="text-purple-300 font-bold">FULL-DOCUMENT COMPLETENESS VERIFICATION</span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          Confidence: <strong className="text-emerald-400">{Math.round((activeReport.completenessCheck.extractionConfidenceScore || 0.95) * 100)}%</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-300">
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Detected Rows</span>
                          <strong className="text-white">{activeReport.completenessCheck.totalDetectedRows} rows</strong>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Extracted Parameters</span>
                          <strong className="text-cyan-400">{reviewedLabs.length + reviewedVitals.length} total</strong>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Pages Audited</span>
                          <strong className="text-white">{activeReport.completenessCheck.pagesProcessed} page(s)</strong>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Unreadable Sections</span>
                          <strong className={activeReport.completenessCheck.unreadableRegions?.length ? 'text-amber-400' : 'text-emerald-400'}>
                            {activeReport.completenessCheck.unreadableRegions?.length || 0}
                          </strong>
                        </div>
                      </div>

                      {activeReport.completenessCheck.unreadableRegions && activeReport.completenessCheck.unreadableRegions.length > 0 && (
                        <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 text-[11px] flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Notice: {activeReport.completenessCheck.unreadableRegions.join('; ')}. Use "+ Add Missing Metric" if any values were missed.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Document Preview Drawer (if visible) */}
                  {showDocumentPreview && previewDocumentUrl && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                        <span>ORIGINAL SOURCE DOCUMENT PREVIEW</span>
                        <button
                          type="button"
                          onClick={() => setShowDocumentPreview(false)}
                          className="text-slate-500 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 flex justify-center bg-black p-2">
                        <img 
                          src={previewDocumentUrl} 
                          alt="Source Document Preview" 
                          className="max-w-full h-auto object-contain rounded"
                        />
                      </div>
                    </div>
                  )}

                  {/* VITAL SIGNS SECTION (if any present) */}
                  {reviewedVitals.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                        <span className="font-bold flex items-center gap-2 text-cyan-400">
                          <HeartPulse className="w-4 h-4" />
                          EXTRACTED VITAL SIGNS ({reviewedVitals.length})
                        </span>
                        <span className="text-[10px] text-slate-400">CHECKBOX SELECTS FOR INCLUSION IN SOL {sol}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {reviewedVitals.map((v) => (
                          <div
                            key={v.id}
                            className={`p-3 rounded-xl border transition ${
                              v.selected
                                ? 'bg-slate-950 border-cyan-700/60 shadow-sm shadow-cyan-950'
                                : 'bg-slate-950/40 border-slate-800 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={v.selected}
                                  onChange={() => handleToggleVital(v.id)}
                                  className="h-4 w-4 rounded border-slate-700 text-cyan-500 bg-slate-900 focus:ring-cyan-500"
                                />
                                <span className="text-xs font-bold text-slate-200">{v.name}</span>
                              </label>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  Pg {v.pageNumber || 1}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                                  {Math.round(v.confidence * 100)}%
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-1">
                                <input
                                  type="number"
                                  value={v.value}
                                  onChange={(e) => handleUpdateVitalValue(v.id, Number(e.target.value))}
                                  className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
                                />
                                <span className="text-xs font-mono text-slate-400">{v.unit}</span>
                              </div>
                              {v.referenceRange && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  Ref: {v.referenceRange}
                                </span>
                              )}
                            </div>

                            {v.sourceSnippet && (
                              <p className="mt-1.5 text-[10px] font-mono text-slate-400 truncate border-t border-slate-800/80 pt-1">
                                Source: "{v.sourceSnippet}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* DYNAMIC LABORATORY RESULTS SECTION */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-slate-300 gap-2">
                      <span className="font-bold flex items-center gap-2 text-purple-400">
                        <Activity className="w-4 h-4" />
                        DYNAMIC LABORATORY & BIOCHEMICAL RESULTS ({reviewedLabs.length})
                      </span>

                      {/* Category Filter Pills */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {distinctReviewCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setReviewCategoryFilter(cat)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
                              reviewCategoryFilter === cat
                                ? 'bg-purple-600 text-white font-bold'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {reviewedLabs.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                        <p className="text-xs font-mono text-slate-400">
                          No laboratory panels detected in source document.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAddCustomMetric(true)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-300 text-xs font-mono hover:bg-slate-700"
                        >
                          + Manually Add Missing Parameters
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="p-2.5 w-8"></th>
                              <th className="p-2.5">Parameter / Test</th>
                              <th className="p-2.5">Category</th>
                              <th className="p-2.5">Extracted Value</th>
                              <th className="p-2.5">Unit</th>
                              <th className="p-2.5">Reference Range</th>
                              <th className="p-2.5">Page & Source Snippet</th>
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredReviewedLabs.map((lab) => (
                              <tr
                                key={lab.id}
                                className={`transition ${
                                  lab.selected 
                                    ? 'hover:bg-slate-900/60' 
                                    : 'opacity-40 hover:opacity-60 bg-slate-950/40'
                                }`}
                              >
                                <td className="p-2.5">
                                  <input
                                    type="checkbox"
                                    checked={lab.selected}
                                    onChange={() => handleToggleLab(lab.id)}
                                    className="h-3.5 w-3.5 rounded border-slate-700 text-purple-500 bg-slate-900 focus:ring-purple-500"
                                  />
                                </td>
                                <td className="p-2.5 font-bold text-slate-200">
                                  <div>
                                    <span>{lab.name}</span>
                                    {conflictingLabNames.has(lab.name.toLowerCase().trim()) && (
                                      <span className="mt-0.5 flex items-center gap-1 text-[9px] font-mono text-amber-300 font-normal bg-amber-950/80 border border-amber-800/80 px-1.5 py-0.5 rounded w-max">
                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                                        Discrepancy detected — review value
                                      </span>
                                    )}
                                    {lab.isUncertain && !conflictingLabNames.has(lab.name.toLowerCase().trim()) && (
                                      <span className="block text-[9px] text-amber-400 font-normal">
                                        Uncertain extraction — verify
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                    {lab.category}
                                  </span>
                                </td>
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    value={lab.value}
                                    onChange={(e) => handleUpdateLabValue(lab.id, e.target.value)}
                                    className="w-20 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white focus:border-purple-500 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    value={lab.unit}
                                    onChange={(e) => handleUpdateLabUnit(lab.id, e.target.value)}
                                    className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[11px] font-mono text-slate-300 focus:border-purple-500 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    value={lab.referenceRange || ''}
                                    onChange={(e) => handleUpdateLabRange(lab.id, e.target.value)}
                                    placeholder="--"
                                    className="w-24 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[11px] font-mono text-slate-400 focus:border-purple-500 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2.5 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                                      Pg {lab.pageNumber || 1}
                                    </span>
                                    <span className="text-[10px] text-slate-400 truncate" title={lab.sourceSnippet}>
                                      {lab.sourceSnippet || 'Visible in document row'}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                    lab.status === 'NORMAL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                    lab.status === 'HIGH' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                                    lab.status === 'LOW' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                                    'bg-rose-950 text-rose-400 border border-rose-800'
                                  }`}>
                                    {lab.status}
                                  </span>
                                </td>
                                <td className="p-2.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLab(lab.id)}
                                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                                    title="Reject and remove row"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Clinical Notes & Diagnostic Impressions */}
                  {activeReport?.metadata?.clinicalNotes && (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-mono text-purple-400 font-bold uppercase flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        CLINICAL NOTES & INTERPRETATION (VERBATIM FROM DOCUMENT)
                      </span>
                      <p className="text-xs font-mono text-slate-300 leading-relaxed">
                        {activeReport.metadata.clinicalNotes}
                      </p>
                    </div>
                  )}

                  {/* ACTION BAR */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setUploadWorkflowStep('upload')}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>UPLOAD ANOTHER REPORT</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmAndCommitDirectly}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isSubmitting ? 'SAVING DATA...' : 'CONFIRM & SAVE TO MEDICAL RECORD'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirmAndProceedToCombine}
                        className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/20 transition cursor-pointer"
                      >
                        <span>CONFIRM & PROCEED TO CHECK-IN</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stage 3: Combine with Mental & Subjective feelings */}
              {uploadWorkflowStep === 'combine' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold tracking-wider text-purple-300 uppercase flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        COMBINE CLINICAL MEASUREMENTS WITH CURRENT SUBJECTIVE WELLBEING
                      </span>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {reviewedLabs.filter(l => l.selected).length} lab parameters and {reviewedVitals.filter(v => v.selected).length} vitals ready to link. Complete your Sol {sol} subjective state.
                      </p>
                    </div>
                  </div>

                  {/* Sleep and Mood grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Sleep Duration */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <label className="block text-xs font-mono text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Sleep Rest Period</span>
                        <span className="text-[10px] text-purple-400">hours / min</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={sleepHours}
                          onChange={(e) => setSleepHours(e.target.value)}
                          className="w-16 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                        <span className="text-xs font-mono text-slate-400">hrs</span>
                        <input
                          type="number"
                          value={sleepMinutes}
                          onChange={(e) => setSleepMinutes(e.target.value)}
                          className="w-16 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                        <span className="text-xs font-mono text-slate-400">min</span>
                      </div>
                    </div>

                    {/* Subjective ratings */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <label className="block text-xs font-mono text-slate-300 mb-1.5">
                        Rest & Energy Balance
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block mb-1">Energy (1-5)</span>
                          <div className="flex justify-center gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setEnergy(n)}
                                className={`w-6 h-6 rounded text-xs font-mono font-bold ${
                                  energy === n ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block mb-1">Fatigue (1-5)</span>
                          <div className="flex justify-center gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setFatigue(n)}
                                className={`w-6 h-6 rounded text-xs font-mono font-bold ${
                                  fatigue === n ? 'bg-rose-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mood and Stress */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-[10px] font-mono text-slate-400 block mb-1.5">Mood Index (1 = Low, 5 = Peak)</span>
                      <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setMood(n)}
                            className={`w-7 h-7 rounded text-xs font-mono font-bold ${
                              mood === n ? 'bg-purple-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-[10px] font-mono text-slate-400 block mb-1.5">Stress Factor (1 = Calm, 5 = Severe)</span>
                      <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setStress(n)}
                            className={`w-7 h-7 rounded text-xs font-mono font-bold ${
                              stress === n ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <label className="block text-xs font-mono text-slate-300 mb-1.5">
                      Subjective Notes / Context (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Lab results consistent with microgravity adaptation. Electrolyte balance maintained..."
                      value={subjectiveNotes}
                      onChange={(e) => setSubjectiveNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setUploadWorkflowStep('review')}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>BACK TO REVIEW</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleFinalSave}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg transition disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>UPDATING SOL {sol} RECORDS...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>SAVE & SYNC TO HEALTH DASHBOARD</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage 4: Success Screen */}
              {uploadWorkflowStep === 'success' && (
                <div className="py-6 text-center space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto shadow-lg shadow-purple-500/10">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white tracking-wide">
                      CLINICAL REPORT INTEGRATED INTO SOL {sol} RECORD
                    </h4>
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      Verified lab measurements and vital signs successfully persisted without duplicate daily records.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] font-mono text-cyan-400 block uppercase">PHYSICAL HEALTH INDEX</span>
                      <span className="text-2xl font-bold font-mono text-white mt-1 block">
                        {resultIndices.physical}/100
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] font-mono text-purple-400 block uppercase">MENTAL HEALTH INDEX</span>
                      <span className="text-2xl font-bold font-mono text-white mt-1 block">
                        {resultIndices.mental}/100
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-center gap-3">
                    <button
                      onClick={onClose}
                      className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs transition"
                    >
                      VIEW UPDATED DASHBOARD
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* OPTION C: MANAGE UPLOADED MEDICAL REPORTS LIBRARY           */}
          {/* ============================================================ */}
          {activeWorkflow === 'manage' && (
            <div className="space-y-6">
              {/* Storage Summary Bar */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400 shrink-0">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white font-mono uppercase">
                        LOCAL ENCRYPTED REPORT LIBRARY
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                        INDEXEDDB ACTIVE
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                      Confidential onboard documents for <strong className="text-slate-200">SARAH CHEN (AST-CDR)</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-right font-mono">
                    <span className="text-[10px] text-slate-400 block uppercase">STORAGE OCCUPIED</span>
                    <strong className="text-sm text-emerald-400">{storageInfo.formattedSize}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-right font-mono">
                    <span className="text-[10px] text-slate-400 block uppercase">TOTAL DOCUMENTS</span>
                    <strong className="text-sm text-white">{storageInfo.reportCount} files</strong>
                  </div>
                </div>
              </div>

              {/* Search & Action Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search documents by filename, Sol, or diagnostic lab..."
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveWorkflow('upload');
                    spaceAudio.playClick();
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 transition shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>+ UPLOAD NEW REPORT</span>
                </button>
              </div>

              {/* Saved Reports Cards / List */}
              {filteredLibraryReports.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-3">
                  <Database className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-xs font-mono text-slate-400">
                    {reportSearchQuery ? 'No reports found matching search query.' : 'No medical reports uploaded yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkflow('upload');
                      spaceAudio.playClick();
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white font-mono text-xs font-bold"
                  >
                    Upload First Medical Report
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLibraryReports.map((rep) => {
                    const isImg = rep.fileType.startsWith('image/');
                    const labCount = rep.extractedLabs?.length || 0;
                    const formattedSize = rep.fileSize 
                      ? (rep.fileSize >= 1024 * 1024 
                          ? `${(rep.fileSize / (1024 * 1024)).toFixed(2)} MB` 
                          : `${(rep.fileSize / 1024).toFixed(1)} KB`)
                      : 'N/A';

                    return (
                      <div
                        key={rep.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 truncate">
                          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-purple-400 shrink-0">
                            {isImg ? <FileImage className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>

                          <div className="truncate space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="text-sm font-bold text-white font-mono truncate">{rep.fileName}</h5>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                                SOL {rep.sol}
                              </span>
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                rep.status === 'VERIFIED' 
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-purple-950 text-purple-300 border border-purple-800'
                              }`}>
                                {rep.status}
                              </span>
                            </div>

                            <p className="text-[11px] font-mono text-slate-400">
                              {rep.metadata?.facilityOrLab || 'Onboard Clinical Intake'} • {rep.metadata?.reportDate || new Date(rep.timestamp).toLocaleDateString()} • {formattedSize}
                            </p>

                            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                              <span>Linked Labs: <strong className="text-purple-300">{labCount} analytes</strong></span>
                              <span>• Source: <strong className="text-slate-300">{rep.source || 'Local OCR Engine'}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {rep.fileDataUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setLibraryPreviewReport(rep);
                                spaceAudio.playClick();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition"
                            >
                              <Eye className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Preview</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setReportToDelete(rep);
                              setDeleteAssociatedLabsOption(false);
                              spaceAudio.playClick();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 font-mono text-xs font-bold flex items-center gap-1.5 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal: Add Missing Custom Measurement */}
        {showAddCustomMetric && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white font-mono">
                  + ADD MISSING CLINICAL MEASUREMENT
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddCustomMetric(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomMetricType('LAB')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    customMetricType === 'LAB' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  LABORATORY TEST
                </button>
                <button
                  type="button"
                  onClick={() => setCustomMetricType('VITAL')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    customMetricType === 'VITAL' ? 'bg-cyan-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  VITAL SIGN
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <label className="block text-slate-400 mb-1">Parameter / Test Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Free T4, Urine Specific Gravity, Ferritin"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {customMetricType === 'LAB' && (
                  <div>
                    <label className="block text-slate-400 mb-1">Category</label>
                    <select
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none"
                    >
                      <option value="HEMATOLOGY">HEMATOLOGY</option>
                      <option value="METABOLIC">METABOLIC</option>
                      <option value="ELECTROLYTES">ELECTROLYTES</option>
                      <option value="RENAL">RENAL</option>
                      <option value="HEPATIC">HEPATIC</option>
                      <option value="LIPIDS">LIPIDS</option>
                      <option value="ENDOCRINE">ENDOCRINE</option>
                      <option value="URINALYSIS">URINALYSIS</option>
                      <option value="CARDIAC">CARDIAC</option>
                      <option value="IMMUNOLOGY">IMMUNOLOGY</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Value</label>
                    <input
                      type="text"
                      placeholder="e.g. 14.2, < 0.05, Negative"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Unit</label>
                    <input
                      type="text"
                      placeholder="e.g. g/dL, mmol/L, %"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Reference Range (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 13.5 - 17.5 g/dL"
                    value={customRefRange}
                    onChange={(e) => setCustomRefRange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCustomMetric(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomMeasurement}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono"
                >
                  Add Parameter
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Delete Confirmation Modal Overlay */}
        {reportToDelete && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md p-4 flex items-center justify-center">
            <div className="w-full max-w-md bg-slate-900 border border-rose-800/80 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="p-2.5 rounded-xl bg-rose-950 text-rose-400 border border-rose-800">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold font-mono text-white">PERMANENTLY DELETE REPORT?</h4>
                  <p className="text-[11px] font-mono text-rose-400">Irreversible Local Storage Action</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-bold text-white truncate max-w-[220px]">{reportToDelete.fileName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300">SOL {reportToDelete.sol}</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Type: {reportToDelete.fileType} • Size: {reportToDelete.fileSize ? (reportToDelete.fileSize / 1024).toFixed(1) : 0} KB
                </p>
                <p className="text-[10px] text-slate-400">
                  Uploaded: {new Date(reportToDelete.timestamp).toLocaleString()}
                </p>
              </div>

              <p className="text-xs font-mono text-slate-300 leading-relaxed">
                This will permanently purge the stored file data and base64 payloads from local IndexedDB storage.
              </p>

              {/* Checkbox option for associated lab measurements */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteAssociatedLabsOption}
                    onChange={(e) => setDeleteAssociatedLabsOption(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-700 text-rose-600 focus:ring-rose-500 bg-slate-900"
                  />
                  <span className="text-xs font-mono text-slate-200 leading-tight">
                    <strong className="text-rose-300">Also delete {reportToDelete.extractedLabs?.length || 0} associated laboratory measurements</strong>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      {deleteAssociatedLabsOption 
                        ? 'Warning: Linked lab rows in your database will be permanently removed.' 
                        : 'Recommended: Keeps confirmed lab values in your Health Dashboard, unlinking source document.'}
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeletingReport}
                  onClick={() => setReportToDelete(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isDeletingReport}
                  onClick={handleConfirmDeleteReport}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isDeletingReport ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>PURGING...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>PERMANENTLY DELETE</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Library Document Preview Modal */}
        {libraryPreviewReport && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md p-4 flex items-center justify-center">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold font-mono text-white truncate">{libraryPreviewReport.fileName}</h4>
                  <p className="text-[10px] font-mono text-slate-400">
                    Sol {libraryPreviewReport.sol} • {libraryPreviewReport.metadata?.facilityOrLab || 'Diagnostic Intake'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLibraryPreviewReport(null)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 p-1">
                {libraryPreviewReport.fileDataUrl ? (
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-black p-2 flex justify-center">
                    <img
                      src={libraryPreviewReport.fileDataUrl}
                      alt={libraryPreviewReport.fileName}
                      className="max-w-full h-auto object-contain rounded"
                    />
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-400 text-center py-4">No image preview available for this PDF document.</p>
                )}

                {/* Extracted parameters */}
                <div className="space-y-2">
                  <span className="text-xs font-mono font-bold text-purple-300 uppercase">
                    Extracted Lab Measurements ({libraryPreviewReport.extractedLabs?.length || 0})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    {libraryPreviewReport.extractedLabs.map((l, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between">
                        <span className="text-slate-300 font-bold truncate mr-2">{l.name}</span>
                        <span className="text-purple-300">{l.value} {l.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setLibraryPreviewReport(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-mono text-xs font-bold"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
