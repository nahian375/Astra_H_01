/**
 * ASTRA Health - Medical Report Upload & Clinical Data Extraction Types
 */

export type LabCategory = 
  | 'HEMATOLOGY' 
  | 'METABOLIC' 
  | 'ELECTROLYTES' 
  | 'RENAL' 
  | 'HEPATIC' 
  | 'LIPIDS' 
  | 'ENDOCRINE' 
  | 'URINALYSIS'
  | 'CARDIAC'
  | 'IMMUNOLOGY'
  | 'OTHER';

export type MetricStatus = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export interface ExtractedVitalSign {
  id: string;
  name: string; // e.g., 'Heart Rate', 'Blood Pressure (Systolic)', 'SpO2', 'Temperature'
  key?: 'heartRate' | 'bloodPressureSystolic' | 'bloodPressureDiastolic' | 'spo2' | 'respiratoryRate' | 'coreTemperature' | 'exerciseMinutes' | 'sleepHours';
  value: number;
  unit: string;
  referenceRange?: string;
  status?: MetricStatus;
  confidence: number; // 0 - 1
  selected: boolean;
  pageNumber?: number;
  sourceSnippet?: string;
  isUncertain?: boolean;
  existingValue?: number;
  conflictResolution?: 'keep_existing' | 'use_extracted' | 'custom';
  isCustom?: boolean;
}

export interface ExtractedLabResult {
  id: string;
  name: string; // Dynamic parameter name from source document
  category: LabCategory | string;
  value: number | string;
  numericValue?: number;
  unit: string;
  referenceRange?: string;
  status: MetricStatus;
  confidence: number;
  selected: boolean;
  pageNumber?: number;
  sourceSnippet?: string;
  isUncertain?: boolean;
  notes?: string;
  reportId?: string;
  sourceDeleted?: boolean;
  sourceDocumentName?: string;
}

export interface ExtractedReportMetadata {
  reportTitle?: string;
  facilityOrLab?: string;
  doctorOrExaminer?: string;
  reportDate?: string; // YYYY-MM-DD
  measurementDate?: string;
  patientCallsign?: string;
  clinicalNotes?: string;
  diagnosticImpressions?: string[];
  findingsSummary?: string;
}

export interface DocumentCompletenessCheck {
  totalDetectedRows: number;
  totalExtractedParameters: number;
  pagesProcessed: number;
  unreadableRegions?: string[];
  extractionConfidenceScore: number;
}

export interface MedicalReportRecord {
  id: string;
  sol: number;
  timestamp: string; // ISO date
  fileName: string;
  fileType: string; // 'application/pdf' | 'image/png' | 'image/jpeg'
  fileSize: number; // bytes
  fileDataUrl?: string; // Data URL or base64 preview
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'VERIFIED' | 'FAILED';
  metadata?: ExtractedReportMetadata;
  extractedVitals: ExtractedVitalSign[];
  extractedLabs: ExtractedLabResult[];
  completenessCheck?: DocumentCompletenessCheck;
  notes?: string;
  consentGiven: boolean;
  errorMessage?: string;
  appliedToCheckInSol?: number;
  createdAt: string;
  updatedAt: string;
  source?: string;
  modelUsed?: string;
}

export interface ExtractionApiResponse {
  success: boolean;
  metadata: ExtractedReportMetadata;
  vitals: ExtractedVitalSign[];
  labs: ExtractedLabResult[];
  completenessCheck?: DocumentCompletenessCheck;
  rawSummary?: string;
  error?: string;
  source?: string;
  modelUsed?: string;
}

