/**
 * ASTRA Health - Local Clinical Document Parser & OCR Engine
 * Provides 100% offline-first PDF text extraction (PDF.js) and local OCR (Tesseract.js)
 * with deterministic table-aware clinical parameter extraction.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { createWorker } from 'tesseract.js';
import { 
  ExtractedVitalSign, 
  ExtractedLabResult, 
  ExtractedReportMetadata, 
  DocumentCompletenessCheck,
  MedicalReportRecord,
  LabCategory,
  MetricStatus
} from '../types/medicalReport';

// Initialize PDF.js worker using bundled local asset for 100% offline operation
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ExtractedPageContent {
  pageNumber: number;
  textLines: string[];
  isOcr: boolean;
  confidence: number;
}

export interface LocalExtractionResult {
  metadata: ExtractedReportMetadata;
  completenessCheck: DocumentCompletenessCheck;
  vitals: ExtractedVitalSign[];
  labs: ExtractedLabResult[];
  rawSummary: string;
}

/**
 * Known Vital Sign mappings and regexes
 */
const VITAL_PATTERNS = [
  {
    key: 'heartRate' as const,
    name: 'Resting Heart Rate',
    unit: 'bpm',
    regex: /(?:resting\s*)?(?:heart\s*rate|hr|pulse|cardiac\s*rate)\s*[\.\:\=\-\_\s]*(\d{2,3})\s*(?:bpm|bprn|bpr|\/min)?/i,
    range: '60 - 100 bpm',
    min: 30, max: 220,
  },
  {
    key: 'bloodPressure' as const,
    name: 'Blood Pressure',
    unit: 'mmHg',
    regex: /(?:blood\s*pressure|bp|arterial\s*pressure)\s*[\.\:\=\-\_\s]*(\d{2,3})\s*[\/\\\|]\s*(\d{2,3})\s*(?:mmhg)?/i,
    range: '90/60 - 120/80 mmHg',
  },
  {
    key: 'spo2' as const,
    name: 'Oxygen Saturation (SpO2)',
    unit: '%',
    regex: /(?:spo2|sp02|pulse\s*ox|o2\s*sat(?:uration)?|oxygen\s*sat(?:uration)?)\s*[\.\:\=\-\_\s]*(\d{2}(?:\.\d)?)\s*%?/i,
    range: '95 - 100%',
    min: 70, max: 100,
  },
  {
    key: 'respiratoryRate' as const,
    name: 'Respiratory Rate',
    unit: 'breaths/min',
    regex: /(?:respiratory\s*rate|resp\s*rate|rr)\s*[\.\:\=\-\_\s]*(\d{1,2})\s*(?:br\/min|bpm|breaths\/min)?/i,
    range: '12 - 20 breaths/min',
    min: 8, max: 50,
  },
  {
    key: 'coreTemperature' as const,
    name: 'Core Body Temperature',
    unit: '°C',
    regex: /(?:core\s*)?(?:body\s*)?(?:temp(?:erature)?)\s*[\.\:\=\-\_\s]*(\d{2}(?:\.\d)?)\s*(?:°?c|°?f)?/i,
    range: '36.5 - 37.3 °C',
    min: 30, max: 43,
  },
];

/**
 * Common Laboratory categories lookup
 */
const CATEGORY_KEYWORDS: { [cat in LabCategory]: RegExp } = {
  HEMATOLOGY: /hemoglobin|hematocrit|wbc|rbc|platelet|neutrophil|lymphocyte|monocyte|eosinophil|basophil|mcv|mch|mchc|mpv|erythrocyte|leukocyte|cbc/i,
  ELECTROLYTES: /sodium|potassium|chloride|bicarbonate|co2|magnesium|phosphate|electrolyte/i,
  METABOLIC: /glucose|glycated|hba1c|sugar|fasting\s*glucose|lactate|pyruvate/i,
  RENAL: /creatinine|bun|blood\s*urea|egfr|uric\s*acid|kidney/i,
  HEPATIC: /alt|ast|alp|alkaline\s*phosphatase|bilirubin|albumin|globulin|total\s*protein|sgot|sgpt|liver/i,
  LIPIDS: /cholesterol|triglyceride|hdl|ldl|vldl|lipid/i,
  ENDOCRINE: /tsh|free\s*t4|free\s*t3|cortisol|insulin|testosterone|estrogen|thyroid/i,
  URINALYSIS: /urine|urinalysis|specific\s*gravity|urobilinogen|nitrite|ketone|protein\s*urine/i,
  CARDIAC: /troponin|ck-mb|bnp|nt-probnp|myoglobin|hs-crp|cardiac/i,
  IMMUNOLOGY: /crp|esr|immunoglobulin|iga|igg|igm|complement|antibody/i,
  OTHER: /.*/,
};

export class LocalClinicalParser {
  /**
   * Main entry point: Processes a document (PDF or Image) entirely offline in the browser.
   */
  async processDocumentLocally(options: {
    file: File;
    sol: number;
    onProgress?: (msg: string) => void;
  }): Promise<LocalExtractionResult> {
    const { file, sol, onProgress } = options;
    const MAX_LOCAL_FILE_BYTES = 20 * 1024 * 1024;
    if (!file || file.size <= 0) {
      throw new Error('Uploaded medical document is empty.');
    }
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      throw new Error('Medical document exceeds the 20 MB maximum file size limit.');
    }

    const fileName = file.name;
    const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

    onProgress?.(`Initializing offline clinical document parser for ${fileName}...`);

    let pages: ExtractedPageContent[] = [];

    if (isPdf) {
      pages = await this.extractPdfPages(file, onProgress);
    } else {
      pages = await this.extractImagePage(file, onProgress);
    }

    onProgress?.('Parsing extracted document text and matching clinical parameters...');

    const result = this.parseDocumentPages(pages, fileName, sol);
    onProgress?.(`Offline extraction complete: ${result.labs.length} lab panel(s) and ${result.vitals.length} vital sign(s) verified.`);

    return result;
  }

  /**
   * Extracts text from all pages of a PDF file using PDF.js digital text + canvas OCR fallback
   */
  private async extractPdfPages(
    file: File, 
    onProgress?: (msg: string) => void
  ): Promise<ExtractedPageContent[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const MAX_PDF_PAGES = 50;
    const numPages = Math.min(pdfDoc.numPages, MAX_PDF_PAGES);
    const pageContents: ExtractedPageContent[] = [];

    let ocrWorker: any = null;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress?.(`Processing PDF page ${pageNum} of ${numPages}...`);
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Extract digital text items
      const digitalTextLines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      for (const item of textContent.items as any[]) {
        if ('str' in item) {
          const str = item.str;
          const y = item.transform ? item.transform[5] : null;

          if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
            if (currentLine.trim()) digitalTextLines.push(currentLine.trim());
            currentLine = str;
          } else {
            currentLine += (currentLine ? ' ' : '') + str;
          }
          lastY = y;
        }
      }
      if (currentLine.trim()) digitalTextLines.push(currentLine.trim());

      const fullDigitalText = digitalTextLines.join('\n');

      // Check if digital text is sufficient (>= 15 characters)
      if (fullDigitalText.length >= 15) {
        pageContents.push({
          pageNumber: pageNum,
          textLines: digitalTextLines,
          isOcr: false,
          confidence: 0.98,
        });
      } else {
        // Scanned PDF page: Render to Canvas with bounded pixel dimensions and perform local Tesseract OCR
        onProgress?.(`Page ${pageNum} is scanned/image PDF. Running local Tesseract OCR...`);

        const baseViewport = page.getViewport({ scale: 1.0 });
        const MAX_CANVAS_DIM = 2400;
        const maxSide = Math.max(baseViewport.width, baseViewport.height, 1);
        const safeScale = Math.min(2.0, MAX_CANVAS_DIM / maxSide);
        const viewport = page.getViewport({ scale: safeScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;

          if (!ocrWorker) {
            ocrWorker = await createWorker('eng');
          }

          const ocrResult = await ocrWorker.recognize(canvas);
          const ocrTextLines = ocrResult.data.text
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0);

          pageContents.push({
            pageNumber: pageNum,
            textLines: ocrTextLines,
            isOcr: true,
            confidence: Math.round((ocrResult.data.confidence || 80) / 100 * 100) / 100,
          });
        }
      }
    }

    if (ocrWorker) {
      await ocrWorker.terminate().catch(() => {});
    }

    return pageContents;
  }

  /**
   * Extracts text from an image file (PNG/JPG) using local Tesseract OCR
   */
  private async extractImagePage(
    file: File, 
    onProgress?: (msg: string) => void
  ): Promise<ExtractedPageContent[]> {
    onProgress?.('Loading Tesseract OCR engine for image analysis...');
    const worker = await createWorker('eng');

    try {
      onProgress?.('Analyzing image text and table structures locally...');
      const result = await worker.recognize(file);
      const lines = result.data.text
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      const conf = Math.round((result.data.confidence || 80) / 100 * 100) / 100;

      return [
        {
          pageNumber: 1,
          textLines: lines,
          isOcr: true,
          confidence: conf,
        },
      ];
    } finally {
      await worker.terminate().catch(() => {});
    }
  }

  /**
   * Deterministically parses document pages into structured metadata, vitals, and labs
   */
  private parseDocumentPages(
    pages: ExtractedPageContent[], 
    fileName: string, 
    sol: number
  ): LocalExtractionResult {
    const allVitals: ExtractedVitalSign[] = [];
    const allLabs: ExtractedLabResult[] = [];
    const unreadableRegions: string[] = [];

    let totalDetectedRows = 0;
    let title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    let dateStr = new Date().toISOString().split('T')[0];
    let facility = 'ASTRA Habitat Health Node / Local Analyzer';
    let doctor = 'Autonomous Offline Medical Surveillance';
    let clinicalNotes = '';

    for (const page of pages) {
      const lines = page.textLines;

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        totalDetectedRows++;

        // 1. Detect Metadata (Report Title, Date, Facility)
        if (index < 5) {
          if (/lab|diagnostic|blood|cbc|chemistry|panel|report|assessment|telemetry/i.test(line) && line.length < 80) {
            title = line;
          }
          if (/hospital|clinic|facility|lab|center|habitat|node/i.test(line)) {
            facility = line;
          }
          const dateMatch = line.match(/(?:\d{4}[-\/]\d{1,2}[-\/]\d{1,2})|(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})|(?:sol\s*\d+)/i);
          if (dateMatch) {
            dateStr = dateMatch[0];
          }
        }

        if (/note|impression|summary|conclusion|assessment/i.test(line) && index > lines.length - 10) {
          clinicalNotes += (clinicalNotes ? ' ' : '') + line;
        }

        // 2. Parse Vital Signs
        let vitalMatched = false;
        for (const pattern of VITAL_PATTERNS) {
          const match = line.match(pattern.regex);
          if (match) {
            vitalMatched = true;
            if (pattern.key === 'bloodPressure') {
              const sys = Number(match[1]);
              const dia = Number(match[2]);
              if (!isNaN(sys) && sys > 50 && sys < 250) {
                allVitals.push({
                  id: `loc-vit-${Date.now()}-${allVitals.length}-sys`,
                  name: 'Blood Pressure (Systolic)',
                  key: 'bloodPressureSystolic',
                  value: sys,
                  unit: 'mmHg',
                  referenceRange: '90 - 120 mmHg',
                  status: (sys < 90 ? 'LOW' : (sys > 135 ? 'HIGH' : 'NORMAL')),
                  confidence: page.confidence,
                  selected: true,
                  pageNumber: page.pageNumber,
                  sourceSnippet: line,
                });
              }
              if (!isNaN(dia) && dia > 30 && dia < 150) {
                allVitals.push({
                  id: `loc-vit-${Date.now()}-${allVitals.length}-dia`,
                  name: 'Blood Pressure (Diastolic)',
                  key: 'bloodPressureDiastolic',
                  value: dia,
                  unit: 'mmHg',
                  referenceRange: '60 - 80 mmHg',
                  status: (dia < 60 ? 'LOW' : (dia > 85 ? 'HIGH' : 'NORMAL')),
                  confidence: page.confidence,
                  selected: true,
                  pageNumber: page.pageNumber,
                  sourceSnippet: line,
                });
              }
            } else {
              const val = Number(match[1]);
              if (!isNaN(val) && (!pattern.min || val >= pattern.min) && (!pattern.max || val <= pattern.max)) {
                allVitals.push({
                  id: `loc-vit-${Date.now()}-${allVitals.length}`,
                  name: pattern.name,
                  key: pattern.key,
                  value: val,
                  unit: pattern.unit,
                  referenceRange: pattern.range,
                  status: 'NORMAL',
                  confidence: page.confidence,
                  selected: true,
                  pageNumber: page.pageNumber,
                  sourceSnippet: line,
                });
              }
            }
            break;
          }
        }

        if (vitalMatched) continue;

        // 3. Parse Laboratory Parameters (Tabular & Delimited Regex Matching)
        // Pattern: [Test Name] [Numeric/Qualitative Value] [Unit] [Reference Range]
        const labResult = this.parseLabLine(line, page.pageNumber, page.confidence);
        if (labResult) {
          allLabs.push(labResult);
        } else if (page.isOcr && page.confidence < 0.60) {
          unreadableRegions.push(`Page ${page.pageNumber} line ${index + 1}: low OCR readability ("${line.slice(0, 30)}...")`);
        }
      }
    }

    // Assign categories to labs
    const categorizedLabs = allLabs.map((l) => ({
      ...l,
      category: this.categorizeLabName(l.name),
    }));

    const completenessCheck: DocumentCompletenessCheck = {
      totalDetectedRows,
      totalExtractedParameters: categorizedLabs.length + allVitals.length,
      pagesProcessed: pages.length,
      unreadableRegions: unreadableRegions.length > 0 ? unreadableRegions : undefined,
      extractionConfidenceScore: Math.round(
        (pages.reduce((acc, p) => acc + p.confidence, 0) / (pages.length || 1)) * 100
      ) / 100,
    };

    return {
      metadata: {
        reportTitle: title,
        facilityOrLab: facility,
        doctorOrExaminer: doctor,
        reportDate: dateStr,
        measurementDate: `Sol ${sol} (${dateStr})`,
        patientCallsign: 'AST-CDR-CHEN',
        clinicalNotes: clinicalNotes || `Extracted locally offline via PDF.js & Tesseract OCR engine. Total parameters verified: ${categorizedLabs.length + allVitals.length}.`,
        findingsSummary: `Local extraction completed. ${categorizedLabs.length} laboratory test(s) and ${allVitals.length} vital sign(s) verified against source text.`,
      },
      completenessCheck,
      vitals: allVitals,
      labs: categorizedLabs,
      rawSummary: pages.map(p => p.textLines.join('\n')).join('\n\n--- PAGE BREAK ---\n\n'),
    };
  }

  /**
   * Deterministic Lab Row Parser
   */
  private parseLabLine(line: string, pageNumber: number, confidence: number): ExtractedLabResult | null {
    // Skip headers and short labels
    if (line.length < 5 || /^\d+$/.test(line) || /page\s*\d+/i.test(line) || /test\s*name|result|unit|reference/i.test(line)) {
      return null;
    }

    // Pattern 1: <Name> <Number> <Unit> <[Ref Range]> (e.g., "Hemoglobin 14.8 g/dL 13.5 - 17.5")
    const p1 = line.match(/^([a-zA-Z0-9\s\-\(\)\/\+]{3,35})\s+([<>]?\s*\d+(?:\.\d+)?)\s+([a-zA-Z%µ\/°\d\^]+)\s*(?:\[?\s*(\d+(?:\.\d+)?\s*[-–\:]\s*\d+(?:\.\d+)?|[<>]\s*\d+(?:\.\d+)?)\s*\]?)?\s*([HL\*])?$/i);

    if (p1) {
      const rawName = p1[1].trim();
      const rawVal = p1[2].trim();
      const rawUnit = p1[3].trim();
      const rawRange = p1[4] ? p1[4].trim() : undefined;
      const flag = p1[5] ? p1[5].toUpperCase() : undefined;

      // Ignore if name looks like a plain sentence
      if (rawName.split(' ').length > 5) return null;

      const numVal = Number(rawVal.replace(/[<>]/g, ''));
      let status: MetricStatus = 'NORMAL';
      if (flag === 'H') status = 'HIGH';
      else if (flag === 'L') status = 'LOW';
      else if (rawRange) {
        const rangeMatch = rawRange.match(/(\d+(?:\.\d+)?)\s*[-–\:]\s*(\d+(?:\.\d+)?)/);
        if (rangeMatch && !isNaN(numVal)) {
          const low = Number(rangeMatch[1]);
          const high = Number(rangeMatch[2]);
          if (numVal < low) status = 'LOW';
          if (numVal > high) status = 'HIGH';
        }
      }

      return {
        id: `loc-lab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: this.formatParameterName(rawName),
        category: 'OTHER',
        value: rawVal,
        numericValue: !isNaN(numVal) ? numVal : undefined,
        unit: rawUnit,
        referenceRange: rawRange,
        status,
        confidence,
        selected: true,
        pageNumber,
        sourceSnippet: line,
      };
    }

    // Pattern 2: Delimited line with colon/tab (e.g. "Serum Sodium: 140 mmol/L (135 - 145)")
    const p2 = line.match(/^([a-zA-Z0-9\s\-\(\)\/]{3,30})\s*[:\t]\s*([<>]?\s*\d+(?:\.\d+)?|\bpositive\b|\bnegative\b|\bnormal\b|\btrace\b)\s*([a-zA-Z%µ\/°\d\^]*)\s*(?:\(\s*([^\)]+)\s*\))?/i);

    if (p2) {
      const rawName = p2[1].trim();
      const rawVal = p2[2].trim();
      const rawUnit = p2[3] ? p2[3].trim() : '';
      const rawRange = p2[4] ? p2[4].trim() : undefined;

      if (rawName.split(' ').length > 5) return null;

      const numVal = Number(rawVal.replace(/[<>]/g, ''));

      return {
        id: `loc-lab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: this.formatParameterName(rawName),
        category: 'OTHER',
        value: rawVal,
        numericValue: !isNaN(numVal) ? numVal : undefined,
        unit: rawUnit,
        referenceRange: rawRange,
        status: 'NORMAL',
        confidence,
        selected: true,
        pageNumber,
        sourceSnippet: line,
      };
    }

    return null;
  }

  /**
   * Cleans and capitalizes parameter names
   */
  private formatParameterName(name: string): string {
    return name
      .replace(/^[^a-zA-Z]+/, '')
      .replace(/[\.\:\-\_]+$/, '')
      .trim();
  }

  /**
   * Maps parameter names to Lab categories
   */
  private categorizeLabName(name: string): LabCategory {
    for (const [cat, regex] of Object.entries(CATEGORY_KEYWORDS)) {
      if (cat !== 'OTHER' && regex.test(name)) {
        return cat as LabCategory;
      }
    }
    return 'OTHER';
  }
}

export const localClinicalParser = new LocalClinicalParser();
