import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2 as DivisionIcon,
  Check as CheckIcon,
  ChevronDown as ChevronIcon,
  PackageOpen as EmptyMaterialsIcon,
  RefreshCw as RefreshIcon,
  Search as SearchIcon,
  ShoppingCart as CartIcon,
  Trash2 as TrashIcon,
  UserRound as UserIcon,
} from 'lucide-react';
import spaarLogo from './assets/spaar-logo.png?inline';
import './App.css';
import { Dialog } from './components/Dialog';
import { errorMessage, findTechnicianEmail, loadMaterials, loadTechnicians, submitRequest } from './data';
import {
  DIVISIONS,
  MAX_QUANTITY,
  clampQuantity,
  type Division,
  type Material,
  type RequestLine,
  type RequestReceipt,
  type Technician,
} from './domain';
import { matchesMaterialSearch } from './materialSearch';

type Confirmation = 'division' | 'clear' | 'reset' | null;

const MATERIALS_PER_PAGE = 8;
const IS_DIRECT_LOCAL_PREVIEW = import.meta.env.DEV && window.self === window.top;
const LOCAL_PLAY_MESSAGE = 'Live connectors are unavailable in the localhost preview. Open the Local Play URL instead.';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

interface SummaryProps {
  lines: RequestLine[];
  notes: string;
  technician: Technician | null;
  division: Division | null;
  onChangeQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  canSubmit: boolean;
  compact?: boolean;
}

function RequestSummary({
  lines,
  notes,
  technician,
  division,
  onChangeQuantity,
  onRemove,
  onSubmit,
  submitting,
  canSubmit,
  compact = false,
}: SummaryProps) {
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <section className={`summary ${compact ? 'summary--compact' : ''}`} aria-label="Request summary">
      <div className="summary__heading">
        <div>
          <p className="eyebrow">Request summary</p>
          <h2>Selected materials</h2>
        </div>
        <span className="count-badge">{lines.length}</span>
      </div>

      {!lines.length ? (
        <div className="empty-cart">
          <div className="empty-cart__icon"><EmptyMaterialsIcon size={28} /></div>
          <h3>No materials selected</h3>
          <p>Added materials will appear here.</p>
        </div>
      ) : (
        <div className="summary__lines">
          {lines.map((line) => (
            <article className="summary-line" key={line.id}>
              <div className="summary-line__top">
                <div>
                  <h3>{line.name}</h3>
                  <p>{line.productCode || 'No product code'} · {line.unit || 'Unit not listed'}</p>
                </div>
                <button
                  className="icon-button icon-button--danger"
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onRemove(line.id)}
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="quantity-stepper quantity-stepper--summary">
                <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => onChangeQuantity(line.id, line.quantity - 1)}>−</button>
                <input
                  aria-label={`Quantity for ${line.name}`}
                  inputMode="numeric"
                  max={MAX_QUANTITY}
                  min="1"
                  type="number"
                  value={line.quantity}
                  onChange={(event) => onChangeQuantity(line.id, Number(event.target.value))}
                />
                <button type="button" aria-label={`Increase ${line.name}`} onClick={() => onChangeQuantity(line.id, line.quantity + 1)}>+</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="summary__details">
        <div><span>Technician</span><strong>{technician?.bponum || 'Not selected'}</strong></div>
        <div><span>Division</span><strong>{division?.label || 'Not selected'}</strong></div>
        <div><span>Total quantity</span><strong>{totalUnits}</strong></div>
        {notes.trim() && <div><span>Notes</span><strong className="summary__notes">{notes.trim()}</strong></div>}
      </div>

      <button className="button button--primary button--wide" type="button" disabled={!canSubmit || submitting} onClick={onSubmit}>
        {submitting ? <><span className="spinner" />Submitting…</> : <><CheckIcon />Submit request</>}
      </button>
      {!canSubmit && <p className="summary__hint">Technician, division, and at least one material are required.</p>}
    </section>
  );
}

function App() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(!IS_DIRECT_LOCAL_PREVIEW);
  const [techniciansError, setTechniciansError] = useState('');
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [technicianPickerOpen, setTechnicianPickerOpen] = useState(false);
  const [technicianSearch, setTechnicianSearch] = useState('');
  const [technicianEmail, setTechnicianEmail] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle');
  const [division, setDivision] = useState<Division | null>(null);
  const [divisionPickerOpen, setDivisionPickerOpen] = useState(false);
  const [divisionSearch, setDivisionSearch] = useState('');
  const [pendingDivision, setPendingDivision] = useState<Division | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState('');
  const [search, setSearch] = useState('');
  const [materialPage, setMaterialPage] = useState(1);
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<RequestLine[]>([]);
  const [notes, setNotes] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receipt, setReceipt] = useState<RequestReceipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const technicianPickerRef = useRef<HTMLDivElement>(null);
  const divisionPickerRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search);

  const isDirty = Boolean(technician || division || lines.length || notes.trim());
  const canSubmit = Boolean(technician && division && lines.length && !materialsLoading);

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => matchesMaterialSearch(material, deferredSearch));
  }, [deferredSearch, materials]);

  const filteredTechnicians = useMemo(() => {
    const term = technicianSearch.trim().toLocaleLowerCase();
    if (!term) return technicians;
    return technicians.filter((item) =>
      `${item.bponum} ${item.stage}`.toLocaleLowerCase().includes(term),
    );
  }, [technicianSearch, technicians]);

  const filteredDivisions = useMemo(() => {
    const term = divisionSearch.trim().toLocaleLowerCase();
    if (!term) return DIVISIONS;
    return DIVISIONS.filter((item) => item.label.toLocaleLowerCase().includes(term));
  }, [divisionSearch]);

  const totalMaterialPages = Math.max(1, Math.ceil(filteredMaterials.length / MATERIALS_PER_PAGE));
  const materialPageStart = (materialPage - 1) * MATERIALS_PER_PAGE;
  const visibleMaterials = filteredMaterials.slice(materialPageStart, materialPageStart + MATERIALS_PER_PAGE);

  async function refreshTechnicians() {
    if (IS_DIRECT_LOCAL_PREVIEW) return;
    setTechniciansLoading(true);
    setTechniciansError('');
    try {
      setTechnicians(await loadTechnicians());
    } catch (error) {
      setTechniciansError(errorMessage(error));
    } finally {
      setTechniciansLoading(false);
    }
  }

  useEffect(() => {
    if (IS_DIRECT_LOCAL_PREVIEW) return;
    let ignore = false;
    void loadTechnicians()
      .then((items) => {
        if (!ignore) setTechnicians(items);
      })
      .catch((error: unknown) => {
        if (!ignore) setTechniciansError(errorMessage(error));
      })
      .finally(() => {
        if (!ignore) setTechniciansLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!technicianPickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      if (!technicianPickerRef.current?.contains(event.target as Node)) {
        setTechnicianPickerOpen(false);
        setTechnicianSearch('');
      }
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, [technicianPickerOpen]);

  useEffect(() => {
    if (!divisionPickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      if (!divisionPickerRef.current?.contains(event.target as Node)) {
        setDivisionPickerOpen(false);
        setDivisionSearch('');
      }
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, [divisionPickerOpen]);

  function resetForm() {
    setTechnician(null);
    setTechnicianPickerOpen(false);
    setTechnicianSearch('');
    setTechnicianEmail('');
    setEmailState('idle');
    setDivision(null);
    setDivisionPickerOpen(false);
    setDivisionSearch('');
    setPendingDivision(null);
    setMaterials([]);
    setMaterialsError('');
    setSearch('');
    setMaterialPage(1);
    setDraftQuantities({});
    setLines([]);
    setNotes('');
    setConfirmation(null);
    setReviewOpen(false);
    setSubmitError('');
  }

  async function selectTechnician(stageid: number) {
    const selected = technicians.find((item) => item.stageid === stageid) || null;
    setTechnician(selected);
    setTechnicianPickerOpen(false);
    setTechnicianSearch('');
    setTechnicianEmail('');
    setSubmitError('');
    if (!selected) {
      setEmailState('idle');
      return;
    }

    setEmailState('loading');
    try {
      const email = await findTechnicianEmail(selected.bponum);
      setTechnicianEmail(email);
      setEmailState(email ? 'found' : 'missing');
    } catch {
      setEmailState('missing');
    }
  }

  async function applyDivision(nextDivision: Division) {
    setDivision(nextDivision);
    setLines([]);
    setDraftQuantities({});
    setSearch('');
    setMaterialPage(1);
    setMaterials([]);
    if (IS_DIRECT_LOCAL_PREVIEW) {
      setMaterialsError(LOCAL_PLAY_MESSAGE);
      return;
    }
    setMaterialsLoading(true);
    setMaterialsError('');
    try {
      setMaterials(await loadMaterials(nextDivision));
    } catch (error) {
      setMaterialsError(errorMessage(error));
    } finally {
      setMaterialsLoading(false);
    }
  }

  function chooseDivision(nextDivision: Division) {
    if (division?.sqlCode === nextDivision.sqlCode) return;
    if (lines.length) {
      setPendingDivision(nextDivision);
      setConfirmation('division');
    } else {
      void applyDivision(nextDivision);
    }
  }

  function quantityFor(materialId: string): number {
    return draftQuantities[materialId] || 1;
  }

  function setDraftQuantity(materialId: string, value: number) {
    setDraftQuantities((current) => ({ ...current, [materialId]: clampQuantity(value) }));
  }

  function addMaterial(material: Material) {
    const quantity = quantityFor(material.id);
    setLines((current) => {
      const existing = current.find((line) => line.id === material.id);
      if (existing) {
        return current.map((line) =>
          line.id === material.id
            ? { ...line, quantity: clampQuantity(line.quantity + quantity) }
            : line,
        );
      }
      return [...current, { ...material, quantity }];
    });
    setDraftQuantities((current) => ({ ...current, [material.id]: 1 }));
  }

  function changeLineQuantity(id: string, quantity: number) {
    setLines((current) => current.map((line) =>
      line.id === id ? { ...line, quantity: clampQuantity(quantity) } : line,
    ));
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  function requestClear() {
    if (lines.length) setConfirmation('clear');
  }

  function requestReset() {
    if (isDirty) setConfirmation('reset');
    else resetForm();
  }

  function confirmAction() {
    if (confirmation === 'division' && pendingDivision) {
      void applyDivision(pendingDivision);
      setPendingDivision(null);
    } else if (confirmation === 'clear') {
      setLines([]);
    } else if (confirmation === 'reset') {
      resetForm();
    }
    setConfirmation(null);
  }

  async function handleSubmit() {
    if (!technician || !division || !lines.length || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitRequest({
        technician,
        technicianEmail,
        division,
        lines,
        notes,
      });
      setReviewOpen(false);
      setReceipt(result);
      resetForm();
    } catch (error) {
      setSubmitError(errorMessage(error));
      setReviewOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const confirmationCopy = confirmation === 'division'
    ? {
        title: 'Change division?',
        description: `Changing to ${pendingDivision?.label || 'the other division'} will clear all selected materials.`,
        confirm: 'Change and clear',
      }
    : confirmation === 'clear'
      ? {
          title: 'Clear selected materials?',
          description: 'Your technician, division, and notes will stay in place.',
          confirm: 'Clear materials',
        }
      : {
          title: 'Start over?',
          description: 'This will clear the entire request and return to a blank form.',
          confirm: 'Start over',
        };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img className="brand__logo" src={spaarLogo} alt="Spaar" />
          <span className="brand__divider" aria-hidden="true" />
          <div><span>Warehouse</span><strong>Material Request</strong></div> 
        </div>
        <button className="button button--quiet" type="button" onClick={requestReset}>
          <RefreshIcon />Start over
        </button>
      </header>

      <main className="app-main">
        <section className="request-panel">
          <div className="intro">
            <p className="eyebrow">Material request Form</p>
            <h1>Request materials</h1>
            <p>Select a technician and division, then add materials.</p>
          </div>

          {IS_DIRECT_LOCAL_PREVIEW && (
            <div className="alert alert--info" role="status">
              <strong>Design preview only.</strong>
              <span>{LOCAL_PLAY_MESSAGE}</span>
            </div>
          )}

          {submitError && (
            <div className="alert alert--error" role="alert">
              <strong>Request not submitted.</strong>
              <span>{submitError} No approval was started; your selections are still here.</span>
            </div>
          )}

          <section className="form-card" aria-labelledby="request-details-title">
            <div className="section-heading">
              <span className="step-number">1</span>
              <div><h2 id="request-details-title">Request details</h2><p>Select a technician and division.</p></div>
            </div>

            <div className="details-grid">
              <div className="field">
                <div className="field__label-row">
                  <label htmlFor="technician">Technician name <span className="required-mark">*</span></label>
                  <button
                    className={`refresh-button ${techniciansLoading ? 'refresh-button--loading' : ''}`}
                    type="button"
                    aria-label="Refresh technician list"
                    title="Refresh technician list"
                    disabled={techniciansLoading || IS_DIRECT_LOCAL_PREVIEW}
                    onClick={() => void refreshTechnicians()}
                  >
                    <RefreshIcon />
                  </button>
                </div>
                <div className="technician-picker" ref={technicianPickerRef}>
                  <button
                    id="technician"
                    className="select-wrap technician-picker__trigger"
                    type="button"
                    aria-expanded={technicianPickerOpen}
                    aria-haspopup="listbox"
                    disabled={techniciansLoading || Boolean(techniciansError) || IS_DIRECT_LOCAL_PREVIEW}
                    onClick={() => {
                      setTechnicianSearch('');
                      setTechnicianPickerOpen((open) => !open);
                    }}
                  >
                    <UserIcon />
                    <span>
                      {techniciansLoading
                        ? 'Loading technicians…'
                        : technician
                          ? `${technician.bponum} - ${technician.stage}`
                          : 'Select technician'}
                    </span>
                    <ChevronIcon />
                  </button>
                  {technicianPickerOpen && (
                    <div className="technician-picker__menu">
                      <div className="technician-picker__search">
                        <SearchIcon />
                        <input
                          autoFocus
                          type="search"
                          value={technicianSearch}
                          placeholder="Search technician name or unit"
                          aria-label="Search technician name or unit"
                          onChange={(event) => setTechnicianSearch(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setTechnicianPickerOpen(false);
                          }}
                        />
                      </div>
                      <div className="technician-picker__options" role="listbox" aria-label="Technicians">
                        {filteredTechnicians.map((item) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={technician?.stageid === item.stageid}
                            className={technician?.stageid === item.stageid ? 'is-selected' : ''}
                            key={item.stageid}
                            onClick={() => void selectTechnician(item.stageid)}
                          >
                            <span className="technician-picker__option-label">
                              <strong>{item.bponum}</strong>
                              <small>{item.stage}</small>
                            </span>
                            {technician?.stageid === item.stageid && <CheckIcon />}
                          </button>
                        ))}
                        {!filteredTechnicians.length && <p>No technicians match that search.</p>}
                      </div>
                    </div>
                  )}
                </div>
                {techniciansError && <p className="field-message field-message--error">{techniciansError}</p>}
                {technician && emailState === 'loading' && <p className="field-message">Looking up technician email…</p>}
                {technician && emailState === 'found' && <p className="field-message field-message--success">Email matched: {technicianEmail}</p>}
                {technician && emailState === 'missing' && <p className="field-message field-message--warning">No email match found.</p>}
              </div>

              <fieldset className="field division-field">
                <legend>Division <span className="required-mark">*</span></legend>
                <div className="division-picker" ref={divisionPickerRef}>
                  <button
                    id="division-picker"
                    className="select-wrap division-picker__trigger"
                    type="button"
                    aria-expanded={divisionPickerOpen}
                    aria-haspopup="listbox"
                    disabled={materialsLoading}
                    onClick={() => {
                      setDivisionSearch('');
                      setDivisionPickerOpen((open) => !open);
                    }}
                  >
                    <DivisionIcon />
                    <span>{division?.label || 'Select division'}</span>
                    <ChevronIcon />
                  </button>
                  {divisionPickerOpen && (
                    <div className="division-picker__menu">
                      <div className="technician-picker__search">
                        <SearchIcon />
                        <input
                          autoFocus
                          type="search"
                          value={divisionSearch}
                          placeholder="Search divisions"
                          aria-label="Search divisions"
                          onChange={(event) => setDivisionSearch(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setDivisionPickerOpen(false);
                              setDivisionSearch('');
                            }
                          }}
                        />
                      </div>
                      <div className="technician-picker__options" role="listbox" aria-label="Divisions">
                        {filteredDivisions.map((item) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={division?.sqlCode === item.sqlCode}
                            className={division?.sqlCode === item.sqlCode ? 'is-selected' : ''}
                            key={item.sqlCode}
                            onClick={() => {
                              setDivisionPickerOpen(false);
                              setDivisionSearch('');
                              chooseDivision(item);
                            }}
                          >
                            <span className="technician-picker__option-label">
                              <strong>{item.label}</strong>
                            </span>
                            {division?.sqlCode === item.sqlCode && <CheckIcon />}
                          </button>
                        ))}
                        {!filteredDivisions.length && <p>No divisions match that search.</p>}
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>
            </div>
          </section>

          <section className="form-card material-card" aria-labelledby="materials-title">
            <div className="section-heading section-heading--actions">
              <span className="step-number">2</span>
              <div><h2 id="materials-title">Materials</h2><p>{division ? `${division.label} inventory` : 'Select a division to load materials.'}</p></div>
              <button className="button button--outline clear-button" type="button" disabled={!lines.length} onClick={requestClear}>
                <TrashIcon />Clear
              </button>
            </div>

            {!division ? (
              <div className="materials-placeholder">
                <span>1</span><i /><span>2</span>
                <h3>Select a division</h3>
                <p>Materials will appear here.</p>
              </div>
            ) : materialsLoading ? (
              <div className="loading-state" role="status"><span className="spinner spinner--large" /><p>Loading {division.label} materials…</p></div>
            ) : materialsError ? (
              <div className="alert alert--error" role="alert">
                <strong>Materials could not be loaded.</strong><span>{materialsError}</span>
                <button className="button button--outline" type="button" onClick={() => void applyDivision(division)}>Try again</button>
              </div>
            ) : (
              <>
                <div className="material-toolbar">
                  <div className="search-field">
                    <SearchIcon />
                    <label className="sr-only" htmlFor="material-search">Search materials</label>
                    <input
                      id="material-search"
                      type="search"
                      value={search}
                      placeholder="Search by material name or product code"
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setMaterialPage(1);
                      }}
                    />
                  </div>
                  <span>{filteredMaterials.length} result{filteredMaterials.length === 1 ? '' : 's'}</span>
                </div>

                <div className="materials-grid">
                  {visibleMaterials.map((material) => {
                    const selected = lines.find((line) => line.id === material.id);
                    return (
                      <article className={`material-tile ${selected ? 'material-tile--selected' : ''}`} key={material.id}>
                        <div className="material-tile__top">
                          <div className="material-tags">
                            <span className="product-code">{material.productCode || 'No product code'}</span>
                            <span className="material-unit">{material.unit || 'Unit not listed'}</span>
                          </div>
                          {selected && <span className="already-added"><CheckIcon />{selected.quantity} selected</span>}
                        </div>
                        <h3>{material.name}</h3>
                        <div className="material-tile__controls">
                          <span className="quantity-label">Quantity</span>
                          <div className="quantity-stepper">
                            <button type="button" aria-label={`Decrease ${material.name}`} onClick={() => setDraftQuantity(material.id, quantityFor(material.id) - 1)}>−</button>
                            <input
                              aria-label={`Quantity to add for ${material.name}`}
                              inputMode="numeric"
                              max={MAX_QUANTITY}
                              min="1"
                              type="number"
                              value={quantityFor(material.id)}
                              onChange={(event) => setDraftQuantity(material.id, Number(event.target.value))}
                            />
                            <button type="button" aria-label={`Increase ${material.name}`} onClick={() => setDraftQuantity(material.id, quantityFor(material.id) + 1)}>+</button>
                          </div>
                          <button className="button button--add" type="button" onClick={() => addMaterial(material)}>
                            {selected ? 'Add more' : 'Add'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {!filteredMaterials.length && (
                    <div className="no-results"><SearchIcon /><h3>No matching materials</h3><p>Try another material name or product code.</p></div>
                  )}
                </div>

                {filteredMaterials.length > 0 && (
                  <nav className="pagination" aria-label="Material list pages">
                    <p>
                      Showing <strong>{materialPageStart + 1}–{Math.min(materialPageStart + MATERIALS_PER_PAGE, filteredMaterials.length)}</strong> of {filteredMaterials.length}
                    </p>
                    <div>
                      <button type="button" disabled={materialPage === 1} onClick={() => setMaterialPage((page) => Math.max(1, page - 1))}>← Previous</button>
                      <span>Page <strong>{materialPage}</strong> of {totalMaterialPages}</span>
                      <button type="button" disabled={materialPage === totalMaterialPages} onClick={() => setMaterialPage((page) => Math.min(totalMaterialPages, page + 1))}>Next →</button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>

          <section className="form-card" aria-labelledby="notes-title">
            <div className="section-heading">
              <span className="step-number">3</span>
              <div><h2 id="notes-title">Notes <small>Optional</small></h2><p>Add notes if needed.</p></div>
            </div>
            <label className="sr-only" htmlFor="notes">Optional request notes</label>
            <textarea id="notes" maxLength={2000} value={notes} placeholder="Add notes" onChange={(event) => setNotes(event.target.value)} />
            <p className="character-count">{notes.length}/2000</p>
          </section>
        </section>

        <aside className="summary-panel">
          <RequestSummary
            lines={lines}
            notes={notes}
            technician={technician}
            division={division}
            onChangeQuantity={changeLineQuantity}
            onRemove={removeLine}
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            canSubmit={canSubmit}
          />
        </aside>
      </main>

      <div className="mobile-review-bar">
        <button type="button" onClick={() => setReviewOpen(true)}>
          <span><CartIcon /><strong>{lines.length} material{lines.length === 1 ? '' : 's'}</strong></span>
          <span>Review request <span aria-hidden="true">→</span></span>
        </button>
      </div>

      <Dialog
        open={Boolean(confirmation)}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        onClose={() => { setConfirmation(null); setPendingDivision(null); }}
        actions={
          <>
            <button className="button button--outline" type="button" onClick={() => { setConfirmation(null); setPendingDivision(null); }}>Cancel</button>
            <button className="button button--danger" type="button" onClick={confirmAction}>{confirmationCopy.confirm}</button>
          </>
        }
      />

      <Dialog
        open={reviewOpen}
        title="Review your request"
        onClose={() => setReviewOpen(false)}
        actions={<button className="button button--outline" type="button" onClick={() => setReviewOpen(false)}>Back to materials</button>}
      >
        <RequestSummary
          compact
          lines={lines}
          notes={notes}
          technician={technician}
          division={division}
          onChangeQuantity={changeLineQuantity}
          onRemove={removeLine}
          onSubmit={() => void handleSubmit()}
          submitting={submitting}
          canSubmit={canSubmit}
        />
      </Dialog>

      <Dialog
        open={Boolean(receipt)}
        title="Request submitted"
        description="Your material request is now pending approval."
        tone="success"
        actions={<button className="button button--primary button--wide" type="button" onClick={() => setReceipt(null)}>Create another request</button>}
      >
        {receipt && (
          <div className="receipt">
            <div className="receipt__number"><span>Request number</span><strong>{receipt.requestNumber}</strong></div>
            <dl>
              <div><dt>Technician</dt><dd>{receipt.technician.bponum}</dd></div>
              <div><dt>Division</dt><dd>{receipt.division.label}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDate(receipt.submittedAt)}</dd></div>
            </dl>
            <div className="receipt__lines">
              <h3>Materials</h3>
              {receipt.lines.map((line) => (
                <div key={line.id}><span>{line.name}<small>{line.productCode} · {line.unit}</small></span><strong>× {line.quantity}</strong></div>
              ))}
            </div>
            {receipt.notes.trim() && <div className="receipt__notes"><span>Notes</span><p>{receipt.notes}</p></div>}
          </div>
        )}
      </Dialog>

    </div>
  );
}

export default App;
