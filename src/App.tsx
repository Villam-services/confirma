import { Clock3, Database, FileCheck2, FileSearch, FolderSync, History, Library, Loader2, UploadCloud } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DRIVE_LIBRARY_FOLDER_URL, driveLibraryDocuments } from './data/driveLibrary';
import { referenceLibrary } from './data/referenceLibrary';
import { buildFindings, crossReferenceFindings, extractPdfText } from './services/pdfReviewAgent';
import { clearSessions, loadSessions, saveSession } from './services/sessionStore';
import type { CrossReference, LibraryReference, ReviewFinding, ReviewSession } from './types';

type Step = 'idle' | 'reviewing' | 'reviewed' | 'matching';
type ActiveTab = 'review' | 'history' | 'library';

const fullReferenceLibrary: LibraryReference[] = [...driveLibraryDocuments.map((document) => document.reference), ...referenceLibrary];

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [activeTab, setActiveTab] = useState<ActiveTab>('review');
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [references, setReferences] = useState<CrossReference[]>([]);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  const stats = useMemo(
    () => [
      { label: 'Findings', value: findings.length.toString() },
      { label: 'Sources', value: new Set(findings.map((finding) => finding.sourcePage)).size.toString() },
      { label: 'Matches', value: references.length.toString() },
      { label: 'History', value: sessions.length.toString() },
    ],
    [findings, references, sessions],
  );

  async function handleFile(file?: File) {
    if (!file) return;

    setError('');
    setReferences([]);
    setFindings([]);
    setFileName(file.name);
    setActiveTab('review');

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      setStep('idle');
      return;
    }

    try {
      setStep('reviewing');
      const pages = await extractPdfText(file);
      const nextFindings = buildFindings(pages);
      setFindings(nextFindings);
      setStep('reviewed');
      persistSession(file.name, nextFindings, []);
    } catch {
      setError('The PDF could not be reviewed. Try a text-based PDF or upload a clearer file.');
      setStep('idle');
    }
  }

  function runCrossReference() {
    setStep('matching');
    const matches = crossReferenceFindings(findings, fullReferenceLibrary);
    setReferences(matches);
    setStep('reviewed');
    persistSession(fileName || 'Untitled PDF', findings, matches);
  }

  function persistSession(name: string, nextFindings: ReviewFinding[], nextReferences: CrossReference[]) {
    const session: ReviewSession = {
      id: `${Date.now()}-${name}`,
      fileName: name,
      createdAt: new Date().toISOString(),
      findingCount: nextFindings.length,
      matchCount: nextReferences.length,
      findings: nextFindings,
      references: nextReferences,
    };
    setSessions(saveSession(session));
  }

  function restoreSession(session: ReviewSession) {
    setFileName(session.fileName);
    setFindings(session.findings);
    setReferences(session.references);
    setStep('reviewed');
    setActiveTab('review');
    setError('');
  }

  const busy = step === 'reviewing' || step === 'matching';

  return (
    <main className="app-shell">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">ConfirmaGPT Engineering Review</p>
          <h1>PDF criteria, code, and standards review</h1>
        </div>
        <div className="status-strip" aria-label="Review metrics">
          {stats.map((stat) => (
            <div className="metric" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="review-layout">
        <aside className="control-panel">
          <button className="upload-zone" type="button" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={28} aria-hidden="true" />
            <span>{fileName || 'Upload engineering PDF'}</span>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/pdf"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <div className="tab-list" aria-label="Workspace tabs">
            <TabButton icon={<FileSearch size={17} />} label="Review" active={activeTab === 'review'} onClick={() => setActiveTab('review')} />
            <TabButton icon={<History size={17} />} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            <TabButton icon={<Database size={17} />} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
          </div>

          <div className="step-list" aria-label="Review steps">
            <ReviewStep icon={<FileSearch size={18} />} label="Extract source-backed findings" active={step === 'reviewing'} done={findings.length > 0} />
            <ReviewStep icon={<Library size={18} />} label="Cross-reference Drive library" active={step === 'matching'} done={references.length > 0} />
            <ReviewStep icon={<FileCheck2 size={18} />} label="Session saved" active={false} done={sessions.length > 0} />
          </div>

          <button className="primary-action" type="button" disabled={!findings.length || busy} onClick={runCrossReference}>
            {step === 'matching' ? <Loader2 className="spin" size={18} /> : <Library size={18} />}
            Cross-reference findings
          </button>

          {error ? <div className="error-banner">{error}</div> : null}
        </aside>

        <section className="table-stack" aria-label="Workspace">
          {activeTab === 'review' ? (
            <>
              <FindingTable findings={findings} busy={step === 'reviewing'} />
              {references.length > 0 ? <ReferenceTable references={references} /> : null}
            </>
          ) : null}
          {activeTab === 'history' ? <HistoryPanel sessions={sessions} onRestore={restoreSession} onClear={() => setSessions(clearSessions())} /> : null}
          {activeTab === 'library' ? <LibraryPanel /> : null}
        </section>
      </section>
    </main>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`tab-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function ReviewStep({ icon, label, active, done }: { icon: ReactNode; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`review-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span className="step-icon">{active ? <Loader2 className="spin" size={18} /> : icon}</span>
      <span>{label}</span>
    </div>
  );
}

function FindingTable({ findings, busy }: { findings: ReviewFinding[]; busy: boolean }) {
  const rows = busy
    ? [{ id: 'loading', category: '', topic: '', requirement: '', value: '', sourcePage: 0, sourceExcerpt: '', confidence: '' }]
    : findings.length
      ? findings
      : [{ id: 'empty', category: '', topic: '', requirement: '', value: '', sourcePage: 0, sourceExcerpt: '', confidence: '' }];

  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Topic</th>
            <th>Requirement / Information</th>
            <th>Value</th>
            <th>Source</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((finding) => (
            <tr key={finding.id}>
              <td>{finding.category || (busy ? 'Reviewing' : 'Upload PDF')}</td>
              <td>{finding.topic || (busy ? 'Extracting' : 'Awaiting file')}</td>
              <td>{finding.requirement || (busy ? 'PDF text extraction in progress' : 'No findings loaded')}</td>
              <td>{finding.value || '-'}</td>
              <td>{finding.sourcePage ? `Page ${finding.sourcePage}: ${finding.sourceExcerpt}` : '-'}</td>
              <td>{finding.confidence || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferenceTable({ references }: { references: CrossReference[] }) {
  return (
    <div className="table-card compact">
      <table>
        <thead>
          <tr>
            <th>Finding</th>
            <th>Reference</th>
            <th>Authority</th>
            <th>Jurisdiction</th>
            <th>Match</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {references.map((reference) => (
            <tr key={reference.id}>
              <td>{reference.findingTopic}</td>
              <td>{reference.referenceTitle}</td>
              <td>{reference.authority}</td>
              <td>{reference.jurisdiction}</td>
              <td>{reference.relevance}%</td>
              <td>{reference.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryPanel({ sessions, onRestore, onClear }: { sessions: ReviewSession[]; onRestore: (session: ReviewSession) => void; onClear: () => void }) {
  const rows = sessions.length ? sessions : [{ id: 'empty', fileName: 'No saved sessions', createdAt: '', findingCount: 0, matchCount: 0, findings: [], references: [] }];

  return (
    <div className="table-card history-card">
      <div className="panel-toolbar">
        <div>
          <strong>Session history</strong>
          <span>Saved in this browser for previously reviewed files.</span>
        </div>
        <button className="secondary-action" type="button" disabled={!sessions.length} onClick={onClear}>
          Clear history
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Reviewed</th>
            <th>Findings</th>
            <th>Matches</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((session) => (
            <tr key={session.id}>
              <td>{session.fileName}</td>
              <td>{session.createdAt ? new Date(session.createdAt).toLocaleString() : '-'}</td>
              <td>{session.findingCount}</td>
              <td>{session.matchCount}</td>
              <td>
                {session.findings.length ? (
                  <button className="table-action" type="button" onClick={() => onRestore(session)}>
                    <Clock3 size={15} />
                    Load
                  </button>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LibraryPanel() {
  return (
    <div className="table-card library-card">
      <div className="panel-toolbar">
        <div>
          <strong>Standards library</strong>
          <span>{DRIVE_LIBRARY_FOLDER_URL}</span>
        </div>
        <a className="secondary-link" href={DRIVE_LIBRARY_FOLDER_URL} target="_blank" rel="noreferrer">
          <FolderSync size={15} />
          Open Drive
        </a>
      </div>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Authority</th>
            <th>Category</th>
            <th>Index status</th>
            <th>Matching basis</th>
          </tr>
        </thead>
        <tbody>
          {driveLibraryDocuments.map((document) => (
            <tr key={document.id}>
              <td>{document.fileName}</td>
              <td>{document.reference.authority}</td>
              <td>{document.reference.category}</td>
              <td>{document.status}</td>
              <td>{document.reference.keywords.slice(0, 8).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
