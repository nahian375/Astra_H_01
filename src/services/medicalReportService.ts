/**
 * ASTRA Health - Client-Side Medical Report Processing & Storage Service
 */

import { db } from './db';
import { 
  MedicalReportRecord, 
  ExtractedVitalSign, 
  ExtractedLabResult, 
  ExtractionApiResponse 
} from '../types/medicalReport';
import { connectivityManager } from './connectivityManager';
import { syncManager } from './syncManager';
import { localClinicalParser } from './localClinicalParser';

export interface ProcessDocumentOptions {
  file: File;
  sol: number;
  consentAccepted: boolean;
  onProgress?: (progressText: string) => void;
}

export class MedicalReportService {
  /**
   * Reads a browser File object to Base64
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Generates a preview data URL or thumbnail
   */
  async generateFilePreview(file: File): Promise<string | undefined> {
    if (file.type.startsWith('image/')) {
      return this.fileToBase64(file);
    }
    // For PDFs or other files, we don't store megabytes of PDF previews in DB,
    // but return undefined or a lightweight representation
    return undefined;
  }

  /**
   * Processes a medical report file: converts to base64, requests Gemini extraction from server,
   * handles offline/comms-loss cases, and stores the draft record in Dexie DB.
   */
  async processAndExtractReport(options: ProcessDocumentOptions): Promise<{
    success: boolean;
    report: MedicalReportRecord;
    error?: string;
    isOfflineNotice?: string;
  }> {
    const { file, sol, consentAccepted, onProgress } = options;

    if (!consentAccepted) {
      throw new Error('Astronaut privacy consent is required before processing medical documents.');
    }

    const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
    if (!file || file.size <= 0) {
      throw new Error('Uploaded medical document is empty.');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('Medical document exceeds the 20 MB maximum file size limit.');
    }

    onProgress?.('Preparing document for clinical extraction...');
    const base64Data = await this.fileToBase64(file);
    const previewUrl = await this.generateFilePreview(file);

    const reportId = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    const isConnected = connectivityManager.isOnline();
    let extractionResponse: ExtractionApiResponse | null = null;
    let offlineNotice: string | undefined;

    const inferMimeType = (f: File): string => {
      if (f.type && f.type.trim().length > 0 && f.type !== 'application/octet-stream') {
        return f.type.toLowerCase();
      }
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext === 'png') return 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'pdf') return 'application/pdf';
      return 'application/pdf';
    };

    const calculatedMimeType = inferMimeType(file);

    if (!isConnected) {
      onProgress?.('Earth uplink blackout detected. Initiating local PDF.js and Tesseract OCR engine...');
      offlineNotice = 'Comms link offline. Extracted locally on-station via PDF.js and Tesseract OCR engine.';
      try {
        const localResult = await localClinicalParser.processDocumentLocally({ file, sol, onProgress });
        extractionResponse = {
          success: true,
          ...localResult,
          source: 'LOCAL_PDF_OCR_ENGINE',
        };
      } catch (ocrErr: any) {
        console.warn('[MedicalReportService] Local OCR parser error:', ocrErr);
        offlineNotice = `Local OCR parser error: ${ocrErr?.message || 'Check document format.'}`;
      }
    } else {
      onProgress?.('Encrypting document and transmitting to ASTRA Clinical AI...');
      try {
        const response = await fetch('/api/medical-reports/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType: calculatedMimeType,
            fileName: file.name,
            consentAccepted: true,
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        const rawText = await response.text();

        let parsedBody: any = null;
        if (contentType.includes('application/json') || (rawText && rawText.trim().startsWith('{'))) {
          try {
            parsedBody = JSON.parse(rawText);
          } catch {
            // fallback
          }
        }

        if (!response.ok || !parsedBody || !parsedBody.success) {
          const errMsg = parsedBody?.error || (rawText.trim().startsWith('<') ? `Uplink server error (${response.status})` : rawText) || `Extraction server responded with status ${response.status}`;
          throw new Error(errMsg);
        }

        extractionResponse = parsedBody;
      } catch (netErr: any) {
        console.warn('[MedicalReportService] AI uplink extraction unavailable. Falling back to local PDF.js / OCR parser...', netErr?.message || netErr);
        offlineNotice = `Earth uplink unavailable (${netErr?.message || 'Network error'}). Parsed with on-station PDF.js & Tesseract OCR engine.`;

        try {
          const localResult = await localClinicalParser.processDocumentLocally({ file, sol, onProgress });
          extractionResponse = {
            success: true,
            ...localResult,
            source: 'LOCAL_PDF_OCR_ENGINE_FALLBACK',
          };
        } catch (localErr: any) {
          console.warn('[MedicalReportService] Fallback local OCR error:', localErr);
          extractionResponse = {
            success: true,
            metadata: {
              reportTitle: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Medical Report',
              facilityOrLab: 'Onboard Clinical Intake',
              doctorOrExaminer: 'Manual Astronaut Verification',
              reportDate: new Date().toISOString().split('T')[0],
              measurementDate: `Sol ${sol}`,
              patientCallsign: 'AST-CDR-CHEN',
              clinicalNotes: `Document stored locally. ${netErr?.message || 'Uplink unavailable.'} Inspect document preview and use "+ Add Missing Metric" to record parameters.`,
              findingsSummary: 'Manual verification required for uploaded document.',
            },
            vitals: [],
            labs: [],
            completenessCheck: {
              totalDetectedRows: 0,
              totalExtractedParameters: 0,
              pagesProcessed: 1,
              unreadableRegions: [netErr?.message || 'Uplink unavailable. Manual entry active.'],
              extractionConfidenceScore: 0,
            },
            rawSummary: 'Document stored locally for manual review.',
          };
        }
      }
    }

    const safeMetadata = extractionResponse?.metadata || {
      reportTitle: file.name,
      reportDate: new Date().toISOString().split('T')[0],
      facilityOrLab: 'Onboard Clinical Intake',
    };
    const safeVitals = extractionResponse?.vitals || [];
    const safeLabs = extractionResponse?.labs || [];

    const reportRecord: MedicalReportRecord = {
      id: reportId,
      sol,
      timestamp: nowIso,
      fileName: file.name,
      fileType: calculatedMimeType,
      fileSize: file.size,
      fileDataUrl: previewUrl,
      status: 'EXTRACTED',
      metadata: safeMetadata,
      completenessCheck: extractionResponse?.completenessCheck,
      extractedVitals: safeVitals,
      extractedLabs: safeLabs,
      notes: safeMetadata.clinicalNotes,
      consentGiven: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      source: extractionResponse?.source || 'GEMINI_MULTIMODAL_EXTRACTION',
      modelUsed: extractionResponse?.modelUsed,
    };

    // Save locally to Dexie
    await db.medicalReports.put(reportRecord);
    await syncManager.queueRecord('medicalReports', 'INSERT', reportRecord.id, reportRecord);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('astra:medical-reports-changed', {
        detail: { action: 'insert', reportId: reportRecord.id }
      }));
    }

    return {
      success: true,
      report: reportRecord,
      isOfflineNotice: offlineNotice,
    };
  }

  /**
   * Finalizes verification of a report and commits all selected laboratory results into Dexie.
   */
  async verifyAndCommitReport(
    reportId: string, 
    verifiedVitals: ExtractedVitalSign[], 
    verifiedLabs: ExtractedLabResult[],
    sol: number
  ): Promise<MedicalReportRecord> {
    const existing = await db.medicalReports.get(reportId);
    const nowIso = new Date().toISOString();

    let updated: MedicalReportRecord;
    if (!existing) {
      console.warn(`[MedicalReportService] Report ${reportId} not found in db.medicalReports. Preserving verified clinical records.`);
      const firstLab = verifiedLabs[0];
      const fallbackTitle = firstLab ? `${firstLab.category || 'Clinical'} Report` : 'Clinical Medical Record';
      updated = {
        id: reportId,
        sol,
        timestamp: nowIso,
        fileName: `${fallbackTitle}.pdf`,
        fileType: 'application/pdf',
        fileSize: 1024,
        status: 'VERIFIED',
        metadata: {
          reportTitle: fallbackTitle,
          reportDate: nowIso.split('T')[0],
          measurementDate: `Sol ${sol}`,
          facilityOrLab: 'Onboard Clinical Intake',
        },
        extractedVitals: verifiedVitals,
        extractedLabs: verifiedLabs,
        appliedToCheckInSol: sol,
        consentGiven: true,
        createdAt: nowIso,
        updatedAt: nowIso,
        source: 'CLINICAL_INTAKE_VERIFIED',
      };
    } else {
      updated = {
        ...existing,
        status: 'VERIFIED',
        extractedVitals: verifiedVitals,
        extractedLabs: verifiedLabs,
        appliedToCheckInSol: sol,
        updatedAt: nowIso,
      };
    }

    await db.medicalReports.put(updated);
    await syncManager.queueRecord('medicalReports', 'UPDATE', updated.id, updated);

    // Commit individual lab measurements into laboratoryResults table
    for (let i = 0; i < verifiedLabs.length; i++) {
      const lab = verifiedLabs[i];
      if (lab.selected) {
        // Guarantee globally unique ID scoped to this report to prevent collision with other reports
        const uniqueId = lab.id && !lab.id.startsWith('lab-')
          ? (lab.id.includes(updated.id) ? lab.id : `${updated.id}_${lab.id}`)
          : `${updated.id}_lab_${i}_${Date.now()}`;

        await db.laboratoryResults.put({
          ...lab,
          id: uniqueId,
          sol,
          reportId: updated.id,
          date: updated.metadata?.reportDate || updated.metadata?.measurementDate || `Sol ${sol}`,
          sourceDeleted: false,
          sourceDocumentName: updated.fileName,
          pageNumber: lab.pageNumber || 1,
        });
      }
    }

    // Synchronize confirmed extracted vitals into healthMeasurements for this Sol if present
    const hr = verifiedVitals.find(v => (v.key === 'heartRate' || v.name?.toLowerCase().includes('heart rate')) && v.selected)?.value;
    const bpSys = verifiedVitals.find(v => (v.key === 'bloodPressureSystolic' || v.name?.toLowerCase().includes('systolic')) && v.selected)?.value;
    const bpDia = verifiedVitals.find(v => (v.key === 'bloodPressureDiastolic' || v.name?.toLowerCase().includes('diastolic')) && v.selected)?.value;
    const spo2 = verifiedVitals.find(v => (v.key === 'spo2' || v.name?.toLowerCase().includes('spo2') || v.name?.toLowerCase().includes('oxygen')) && v.selected)?.value;
    const temp = verifiedVitals.find(v => (v.key === 'coreTemperature' || v.name?.toLowerCase().includes('temperature')) && v.selected)?.value;

    if (hr !== undefined || bpSys !== undefined || bpDia !== undefined || spo2 !== undefined || temp !== undefined) {
      const existingTelem = await db.healthMeasurements.where('sol').equals(sol).first();
      if (existingTelem) {
        await db.healthMeasurements.put({
          ...existingTelem,
          ...(hr !== undefined ? { heartRate: Number(hr), restingHeartRate: Number(hr) } : {}),
          ...(bpSys !== undefined ? { bloodPressureSystolic: Number(bpSys) } : {}),
          ...(bpDia !== undefined ? { bloodPressureDiastolic: Number(bpDia) } : {}),
          ...(spo2 !== undefined ? { spo2: Number(spo2) } : {}),
          ...(temp !== undefined ? { coreTemperature: Number(temp) } : {}),
        });
      } else {
        const newTelem = {
          id: `telemetry-sol-${sol}`,
          timestamp: nowIso,
          sol,
          crewId: 'sarah-chen',
          heartRate: hr !== undefined ? Number(hr) : undefined,
          restingHeartRate: hr !== undefined ? Number(hr) : undefined,
          bloodPressureSystolic: bpSys !== undefined ? Number(bpSys) : undefined,
          bloodPressureDiastolic: bpDia !== undefined ? Number(bpDia) : undefined,
          spo2: spo2 !== undefined ? Number(spo2) : undefined,
          coreTemperature: temp !== undefined ? Number(temp) : undefined,
        };
        await db.healthMeasurements.put(newTelem as any);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('astra:medical-reports-changed', {
        detail: { action: 'verify', reportId: updated.id }
      }));
    }

    return updated;
  }

  /**
   * Deletes a report from local DB.
   * Option to delete or preserve linked laboratory results (preserving with sourceDeleted=true by default).
   */
  async deleteReport(reportId: string, deleteAssociatedLabs: boolean = false): Promise<void> {
    // 1. Fetch report details prior to removal for metadata retention
    const existingReport = await db.medicalReports.get(reportId);
    const originalFileName = existingReport?.fileName || 'Medical File';

    // 2. Delete actual medical report record from Dexie
    await db.medicalReports.delete(reportId);

    // 3. Handle linked laboratory results
    const linkedLabs = await db.laboratoryResults.where('reportId').equals(reportId).toArray();
    if (deleteAssociatedLabs) {
      for (const lab of linkedLabs) {
        await db.laboratoryResults.delete(lab.id);
      }
    } else {
      // Retain confirmed health measurements while explicitly marking source document as deleted
      for (const lab of linkedLabs) {
        await db.laboratoryResults.put({
          ...lab,
          sourceDeleted: true,
          sourceDocumentName: originalFileName,
        });
      }
    }

    // 4. Unlink reportId from checkIns table if referenced
    const checkIns = await db.checkIns.toArray();
    for (const ci of checkIns) {
      if (ci.attachedReportIds && ci.attachedReportIds.includes(reportId)) {
        const updatedReportIds = ci.attachedReportIds.filter(id => id !== reportId);
        await db.checkIns.put({
          ...ci,
          attachedReportIds: updatedReportIds.length > 0 ? updatedReportIds : undefined,
        });
      }
    }

    // 5. Queue deletion in sync manager so offline sync never restores it
    await syncManager.queueRecord('medicalReports', 'DELETE', reportId, { id: reportId });

    // 6. Notify app state and dashboard listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('astra:medical-reports-changed', {
        detail: { action: 'delete', reportId, deleteAssociatedLabs }
      }));
    }
  }

  /**
   * Calculates total local storage consumed by medical reports (file payloads & metadata)
   */
  async getTotalStorageUsed(): Promise<{ totalBytes: number; reportCount: number; formattedSize: string }> {
    const reports = await db.medicalReports.toArray();
    let totalBytes = 0;

    for (const rep of reports) {
      if (rep.fileSize) {
        totalBytes += rep.fileSize;
      } else if (rep.fileDataUrl) {
        totalBytes += Math.round(rep.fileDataUrl.length * 0.75);
      } else {
        totalBytes += 1024; // fallback estimate for metadata
      }
    }

    let formattedSize = `${totalBytes} B`;
    if (totalBytes >= 1024 * 1024) {
      formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (totalBytes >= 1024) {
      formattedSize = `${(totalBytes / 1024).toFixed(1)} KB`;
    }

    return {
      totalBytes,
      reportCount: reports.length,
      formattedSize,
    };
  }

  /**
   * Gets all reports from local database
   */
  async getAllReports(): Promise<MedicalReportRecord[]> {
    const reports = await db.medicalReports.toArray();
    return reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Gets all laboratory results from local database
   */
  async getAllLabs(): Promise<(ExtractedLabResult & { sol: number; reportId?: string; date?: string })[]> {
    const labs = await db.laboratoryResults.toArray();
    return labs.sort((a, b) => b.sol - a.sol);
  }
}

export const medicalReportService = new MedicalReportService();
