import React, { useState } from 'react';
import { 
  FileText, 
  HeartPulse, 
  Activity, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Trash2, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  FileCheck, 
  X, 
  Shield, 
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { MedicalReportRecord, ExtractedLabResult } from '../../types/medicalReport';
import { HealthMeasurement } from '../../types/health';
import { spaceAudio } from '../../utils/spaceAudio';

interface MedicalReportsSectionProps {
  reports: MedicalReportRecord[];
  labResults: (ExtractedLabResult & { sol: number; reportId?: string; date?: string })[];
  currentTelemetry?: HealthMeasurement;
  sol: number;
  onOpenUploadReport: () => void;
  onOpenHealthReport: () => void;
  onDeleteReport: (reportId: string) => Promise<void>;
}

export const MedicalReportsSection: React.FC<MedicalReportsSectionProps> = ({
  reports,
  labResults,
  currentTelemetry,
  sol,
  onOpenUploadReport,
  onOpenHealthReport,
  onDeleteReport,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'vitals' | 'labs' | 'reports' | 'history'>('reports');
  const [viewingReport, setViewingReport] = useState<MedicalReportRecord | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    labResults.forEach(l => {
      if (l.category) set.add(l.category);
    });
    ['HEMATOLOGY', 'ELECTROLYTES', 'METABOLIC', 'RENAL', 'HEPATIC', 'ENDOCRINE', 'LIPIDS', 'URINALYSIS'].forEach(c => set.add(c));
    return ['ALL', ...Array.from(set)];
  }, [labResults]);

  const filteredLabs = categoryFilter === 'ALL'
    ? labResults
    : labResults.filter(l => l.category === categoryFilter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NORMAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">NORMAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800">HIGH</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">LOW</span>;
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-400 border border-rose-800">CRITICAL</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">RECORDED</span>;
    }
  };

  return (
    <section 
      aria-label="Medical Reports & Health Records"
      className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden transition-all duration-300"
    >
      {/* ============================================================ */}
      {/* SECTION HEADER WITH COLLAPSIBLE TOGGLE                       */}
      {/* ============================================================ */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div 
          onClick={() => {
            setIsExpanded(prev => !prev);
            spaceAudio.playClick();
          }}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-700/60 text-purple-400 group-hover:border-purple-500 transition">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold">
                CLINICAL ARCHIVE
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {reports.length} REPORT{reports.length !== 1 ? 'S' : ''} • {labResults.length} LAB TESTS
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-wide mt-0.5 flex items-center gap-2">
              <span>MEDICAL REPORTS & HEALTH RECORDS</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
              )}
            </h3>
          </div>
        </div>

        {/* Action Buttons: Upload Report & Generate Health Report */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenHealthReport}
            className="px-3.5 py-2 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-mono font-bold text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Generate Health Report</span>
          </button>
          <button
            type="button"
            onClick={onOpenUploadReport}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/30 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>+ UPLOAD MEDICAL REPORT</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* COLLAPSIBLE BODY                                             */}
      {/* ============================================================ */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* TAB NAVIGATION */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
            <button
              onClick={() => {
                setActiveTab('reports');
                spaceAudio.playClick();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'reports'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>UPLOADED REPORTS ({reports.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('labs');
                spaceAudio.playClick();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'labs'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>LABORATORY RESULTS ({labResults.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('vitals');
                spaceAudio.playClick();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'vitals'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>VERIFIED VITAL SIGNS</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                spaceAudio.playClick();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>CLINICAL HISTORY & IMPRESSIONS</span>
            </button>
          </div>

          {/* TAB 1: UPLOADED REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-3">
              {reports.length === 0 ? (
                <div className="py-8 text-center rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
                  <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs font-mono text-slate-300">No medical reports uploaded yet.</p>
                  <p className="text-[11px] font-mono text-slate-500">
                    Upload lab sheets or check-in files to automatically extract and verify clinical data.
                  </p>
                  <button
                    onClick={onOpenUploadReport}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-mono text-xs border border-slate-700 inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload First Document</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reports.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-purple-950/70 border border-purple-800/50 text-purple-400">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-100 truncate">
                              {rep.metadata?.reportTitle || rep.fileName}
                            </h4>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                              {rep.fileName} • {(rep.fileSize / 1024).toFixed(0)} KB
                            </p>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          rep.status === 'VERIFIED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-purple-950 text-purple-400 border border-purple-800'
                        }`}>
                          {rep.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                        <div>
                          <span className="text-slate-500 block">UPLOAD DATE / SOL</span>
                          <span className="text-slate-200">Sol {rep.sol} ({new Date(rep.timestamp).toLocaleDateString()})</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">MEASUREMENT DATE</span>
                          <span className="text-slate-200">{rep.metadata?.measurementDate || rep.metadata?.reportDate || 'Flight Sol'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">EXTRACTED VITALS</span>
                          <span className="text-cyan-400 font-bold">{rep.extractedVitals?.length || 0} metrics</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">EXTRACTED LABS</span>
                          <span className="text-purple-400 font-bold">{rep.extractedLabs?.length || 0} panels</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => setViewingReport(rep)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Are you sure you want to delete "${rep.fileName}"?`)) {
                              await onDeleteReport(rep.id);
                            }
                          }}
                          className="text-slate-500 hover:text-rose-400 flex items-center gap-1 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LABORATORY RESULTS */}
          {activeTab === 'labs' && (
            <div className="space-y-3">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition ${
                      categoryFilter === cat
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {filteredLabs.length === 0 ? (
                <div className="py-6 text-center rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
                  No laboratory measurements recorded under this category.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Test Name</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Value</th>
                        <th className="p-3">Unit</th>
                        <th className="p-3">Reference Range</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Recorded Date / Sol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredLabs.map((lab) => (
                        <tr key={lab.id} className="hover:bg-slate-900/40 transition">
                          <td className="p-3 font-bold text-slate-200">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{lab.name}</span>
                              {(lab.sourceDeleted || (lab.reportId && !reports.some(r => r.id === lab.reportId))) && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800" title="Source document deleted; confirmed clinical measurement retained">
                                  SOURCE DOCUMENT DELETED
                                </span>
                              )}
                            </div>
                            {lab.notes && (
                              <div className="text-[10px] text-slate-500 font-normal italic">{lab.notes}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {lab.category}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-white">{lab.value}</td>
                          <td className="p-3 text-slate-400">{lab.unit}</td>
                          <td className="p-3 text-slate-400">{lab.referenceRange || 'Nominal'}</td>
                          <td className="p-3">{getStatusBadge(lab.status)}</td>
                          <td className="p-3 text-slate-400">{lab.date || `Sol ${lab.sol}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VERIFIED VITAL SIGNS */}
          {activeTab === 'vitals' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">RESTING HEART RATE</span>
                  <span className="text-xl font-bold font-mono text-white mt-1 block">
                    {currentTelemetry?.restingHeartRate ? `${currentTelemetry.restingHeartRate} bpm` : 'Not recorded'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 mt-1 block">Normal Range: 60 - 100</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">BLOOD PRESSURE</span>
                  <span className="text-xl font-bold font-mono text-white mt-1 block">
                    {currentTelemetry?.bloodPressureSystolic && currentTelemetry?.bloodPressureDiastolic 
                      ? `${currentTelemetry.bloodPressureSystolic}/${currentTelemetry.bloodPressureDiastolic} mmHg`
                      : 'Not recorded'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 mt-1 block">Target: &lt;120/80</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">OXYGEN SATURATION</span>
                  <span className="text-xl font-bold font-mono text-white mt-1 block">
                    {currentTelemetry?.spo2 ? `${currentTelemetry.spo2}%` : 'Not recorded'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 mt-1 block">Target: &gt;95%</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">BODY TEMPERATURE</span>
                  <span className="text-xl font-bold font-mono text-white mt-1 block">
                    {currentTelemetry?.coreTemperature ? `${currentTelemetry.coreTemperature}°C` : 'Not recorded'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 mt-1 block">Target: 36.5 - 37.3°C</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Data source: Combined autonomous onboard bio-sensors + verified flight medical reports</span>
                <span className="text-cyan-400">ACTIVE TELEMETRY SYNCED</span>
              </div>
            </div>
          )}

          {/* TAB 4: CLINICAL HISTORY & IMPRESSIONS */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {reports.filter(r => r.metadata?.clinicalNotes || r.metadata?.diagnosticImpressions?.length).length === 0 ? (
                <div className="py-6 text-center rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
                  No diagnostic impressions or clinical physician notes logged yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {reports
                    .filter(r => r.metadata?.clinicalNotes || r.metadata?.diagnosticImpressions?.length)
                    .map((rep) => (
                      <div
                        key={rep.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono"
                      >
                        <div className="flex items-center justify-between text-slate-400 border-b border-slate-900 pb-2">
                          <span className="font-bold text-white">{rep.metadata?.reportTitle || rep.fileName}</span>
                          <span>Sol {rep.sol} • {rep.metadata?.doctorOrExaminer || 'Medical Surveillance'}</span>
                        </div>
                        {rep.metadata?.clinicalNotes && (
                          <p className="text-slate-300 leading-relaxed italic">
                            "{rep.metadata.clinicalNotes}"
                          </p>
                        )}
                        {rep.metadata?.diagnosticImpressions && rep.metadata.diagnosticImpressions.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 text-slate-300 pt-1">
                            {rep.metadata.diagnosticImpressions.map((imp, idx) => (
                              <li key={idx} className="text-purple-300">{imp}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: VIEW REPORT DETAILS                                   */}
      {/* ============================================================ */}
      {viewingReport && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl text-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-purple-400" />
                <div>
                  <h4 className="text-sm font-bold text-white font-mono">
                    {viewingReport.metadata?.reportTitle || viewingReport.fileName}
                  </h4>
                  <p className="text-[10px] font-mono text-slate-400">
                    Sol {viewingReport.sol} • Status: {viewingReport.status}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata Summary */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">FACILITY / ANALYZER</span>
                <span className="text-slate-200">{viewingReport.metadata?.facilityOrLab || 'Onboard Node'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">EXAMINER</span>
                <span className="text-slate-200">{viewingReport.metadata?.doctorOrExaminer || 'Automated Parser'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">REPORT DATE</span>
                <span className="text-slate-200">{viewingReport.metadata?.reportDate || 'Sol ' + viewingReport.sol}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">PATIENT CALLSIGN</span>
                <span className="text-slate-200">{viewingReport.metadata?.patientCallsign || 'AST-CDR-CHEN'}</span>
              </div>
            </div>

            {/* Completeness Verification */}
            {viewingReport.completenessCheck && (
              <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/40 text-[11px] font-mono flex items-center justify-between text-purple-300">
                <span>
                  Completeness: {viewingReport.completenessCheck.totalExtractedParameters} / {viewingReport.completenessCheck.totalDetectedRows} parameters extracted ({viewingReport.completenessCheck.pagesProcessed} page(s))
                </span>
                <span className="text-emerald-400 font-bold">
                  {Math.round((viewingReport.completenessCheck.extractionConfidenceScore || 0.95) * 100)}% Confidence
                </span>
              </div>
            )}

            {/* Extracted Vitals */}
            {viewingReport.extractedVitals && viewingReport.extractedVitals.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                  EXTRACTED VITAL SIGNS
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {viewingReport.extractedVitals.map(v => (
                    <div key={v.id} className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">{v.name}</span>
                      <strong className="text-white">{v.value} {v.unit}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted Labs */}
            {viewingReport.extractedLabs && viewingReport.extractedLabs.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-purple-400 font-bold uppercase">
                  EXTRACTED LABORATORY TESTS ({viewingReport.extractedLabs.length})
                </span>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2">Test</th>
                        <th className="p-2">Value</th>
                        <th className="p-2">Unit</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {viewingReport.extractedLabs.map(l => (
                        <tr key={l.id}>
                          <td className="p-2 text-slate-300">{l.name}</td>
                          <td className="p-2 font-bold text-white">{l.value}</td>
                          <td className="p-2 text-slate-400">{l.unit}</td>
                          <td className="p-2">{getStatusBadge(l.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Notes */}
            {viewingReport.metadata?.clinicalNotes && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
                <span className="text-[10px] text-purple-400 uppercase font-bold">CLINICAL OBSERVATIONS</span>
                <p className="text-slate-300 italic">{viewingReport.metadata.clinicalNotes}</p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
