import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createProjectSchema,
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_SALES_STAGES,
  PROJECT_SALES_STAGE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  type ClientDetail,
  type CreateProjectInput,
  type ProjectPriority,
  type ProjectType,
} from '@kora/contracts';
import styles from './NewProjectPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { Stepper } from '@/shared/components/ui/Stepper';
import { AlertIcon, ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useCreateProject } from '../api/projects.queries';
import { useClientsList, useClientDetail } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

type ProjectFormValues = z.input<typeof createProjectSchema>;

const TYPE_OPTIONS = PROJECT_TYPES.map((type) => ({ value: type, label: PROJECT_TYPE_LABELS[type] }));
const SALES_STAGE_OPTIONS = PROJECT_SALES_STAGES.map((stage) => ({
  value: stage,
  label: PROJECT_SALES_STAGE_LABELS[stage],
}));
/** Mismo orden que la v1 (Alta/Media/Baja), no el orden alfabético del enum. */
const PRIORITY_ORDER: readonly ProjectPriority[] = ['high', 'medium', 'low'];
const PRIORITY_OPTIONS = PRIORITY_ORDER.map((priority) => ({ value: priority, label: PROJECT_PRIORITY_LABELS[priority] }));
const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
/** Subconjunto creatable de `PROJECT_STATUSES` — mismo orden que "Estado" en la v1. */
const STATUS_OPTIONS = (['active', 'draft', 'on_hold'] as const).map((status) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}));

const STEPS = [{ label: 'Datos del cliente' }, { label: 'Datos del proyecto' }, { label: 'Resumen y confirmación' }];

/** Convierte el `''` de un `<select>` sin elegir a `undefined`, para que los campos `nullish()` del contrato no reciban una cadena vacía. */
const emptyToUndefined = (value: string) => value || undefined;

/** Encabezado de sección — mismo peso visual para todas, con línea divisoria entre secciones (ver `.module.css`). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

/** Tarjeta de detalle del cliente — mismos campos y orden que la v1 (`Empresa` → `Celular`). */
function ClientDetailCard({ client }: { client: ClientDetail }) {
  const primaryContact = client.contacts.find(
    (contact) => contact.name === client.primaryContactName && contact.email === client.primaryContactEmail,
  );

  return (
    <div className={styles.clientCard}>
      <ClientRow label="Empresa" value={client.companyName} />
      <ClientRow label="Razón social" value={client.legalName} />
      <ClientRow label="Rut/Identificador" value={client.taxId} />
      <ClientRow label="Giro" value={client.industry?.name} />
      <ClientRow label="Sitio web" value={client.website} />
      <ClientRow label="Dirección" value={client.address} />
      <ClientRow label="Comuna" value={client.comuna?.name} />
      <ClientRow label="País" value={client.country?.name} />
      <ClientRow label="Nombre contacto" value={client.primaryContactName} />
      <ClientRow label="Cargo" value={primaryContact?.position} />
      <ClientRow label="Correo electrónico" value={client.primaryContactEmail} />
      <ClientRow label="Celular" value={client.primaryContactPhone} />
    </div>
  );
}

function ClientRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={styles.clientRow}>
      <span className={styles.clientLabel}>{label}</span>
      <span className={styles.clientValue}>{value || '-'}</span>
    </div>
  );
}

export function NewProjectPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createProject = useCreateProject();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId') ?? '';
  const [step, setStep] = useState(preselectedClientId ? 1 : 0);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues, unknown, CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      type: 'development',
      salesStage: 'prospect',
      soldHours: 0,
      supportHours: 0,
      clientId: preselectedClientId,
      teams: [],
    },
  });

  const { fields: teamFields, append: appendTeam, remove: removeTeam } = useFieldArray({ control, name: 'teams' });

  const clientId = watch('clientId');
  const type = watch('type') as ProjectType;
  const salesStage = watch('salesStage');
  const status = watch('status');
  const leaderUserId = watch('leaderUserId');
  const soldHours = watch('soldHours');
  const quotationLink = watch('quotationLink');
  const contractLink = watch('contractLink');
  const additionalLinks = watch('additionalLinks');
  const teamsValue = watch('teams') ?? [];

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: clientDetail } = useClientDetail(clientId || null);
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });
  const { data: teams } = useTeamsList({ page: 1, pageSize: 50, sortField: 'name' });

  const leaderLabel = leaders?.items.find((u) => u.id === leaderUserId)?.fullName;

  // Mismas reglas de habilitado que v1: "Estado" solo con Etapa comercial = Aprobado; "Etapa" además
  // exige Estado = Activo; "Equipos" exige Aprobado (no depende de Estado, igual que en v1).
  const isApproved = salesStage === 'approved';
  const isProspecto = salesStage === 'prospect';
  const statusEnabled = isApproved;
  const phaseEnabled = isApproved && status === 'active';
  const equiposEnabled = type === 'development' && isApproved;

  const toggleTeam = (teamId: string) => {
    const index = teamFields.findIndex((field) => field.teamId === teamId);
    if (index >= 0) removeTeam(index);
    else appendTeam({ teamId, leaderUserId: undefined, memberCount: undefined, assignedHours: undefined });
  };

  const totalTeamHours = teamsValue.reduce((sum, team) => sum + (Number(team.assignedHours) || 0), 0);
  const hoursExceeded = equiposEnabled && totalTeamHours > (Number(soldHours) || 0);

  const goToStep2 = () => setStep(1);

  const goToStep3 = async () => {
    const fields: Array<keyof ProjectFormValues> = ['name', 'type'];
    if (type === 'development') fields.push('salesStage');
    const valid = await trigger(fields);
    if (valid && !hoursExceeded) setStep(2);
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createProject.mutateAsync(values);
      toast.success(`Se creó el proyecto ${values.name}.`);
      void navigate(`/proyectos/${result.id}`);
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo crear el proyecto.');
    }
  });

  return (
    <DashboardLayout title="Nuevo proyecto">
      <div className={styles.header}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver"
          onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
        >
          <ChevronLeftIcon size={20} />
        </Button>
        <h1 className={styles.title}>Nuevo proyecto</h1>
      </div>

      <Stepper steps={STEPS} activeIndex={step} />

      <Card>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {serverError && (
            <div className={styles.alert} role="alert">
              <AlertIcon size={18} className={styles.alertIcon} />
              <span>{serverError}</span>
            </div>
          )}

          {step === 0 && (
            <>
              <Section title="Seleccionar cliente">
                <Combobox
                  className={styles.clientField}
                  label="Cliente"
                  placeholder="Buscar cliente…"
                  options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
                  value={clientId ?? ''}
                  onChange={(nextClientId) => setValue('clientId', nextClientId, { shouldValidate: true })}
                  emptyMessage="No se encontraron clientes."
                />
                <p className={styles.hint}>
                  ¿No encuentras el cliente?{' '}
                  <Link className={styles.hintLink} to="/clientes">
                    Créalo primero
                  </Link>
                  .
                </p>

                {clientDetail && <ClientDetailCard client={clientDetail} />}
              </Section>

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" disabled={!clientId} onClick={goToStep2}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Section title="Datos del Proyecto">
                <TextField label="Nombre del proyecto" required errorText={errors.name?.message} {...register('name')} />

                <div className={styles.row}>
                  <Select label="Tipo de proyecto" required options={TYPE_OPTIONS} {...register('type')} />
                  {type === 'development' && (
                    <Select
                      label="Etapa comercial"
                      required
                      options={SALES_STAGE_OPTIONS}
                      errorText={errors.salesStage?.message}
                      {...register('salesStage')}
                    />
                  )}
                  {type === 'development' && (
                    <Select
                      label="Estado"
                      placeholder={statusEnabled ? 'Sin definir' : 'Disponible al aprobar'}
                      disabled={!statusEnabled}
                      options={STATUS_OPTIONS}
                      {...register('status', { setValueAs: emptyToUndefined })}
                    />
                  )}
                  {type === 'development' && (
                    <Select
                      label="Etapa"
                      placeholder={phaseEnabled ? 'Sin definir' : 'Disponible al aprobar y activo'}
                      disabled={!phaseEnabled}
                      options={PHASE_OPTIONS}
                      {...register('phase', { setValueAs: emptyToUndefined })}
                    />
                  )}
                  <Select label="Prioridad" placeholder="Sin definir" options={PRIORITY_OPTIONS} {...register('priority', { setValueAs: emptyToUndefined })} />
                </div>

                <Select
                  className={styles.leaderField}
                  label="Líder Kabeli a cargo"
                  placeholder="Sin asignar"
                  options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                  {...register('leaderUserId', { setValueAs: emptyToUndefined })}
                />
              </Section>

              <Section title="Documentación del proyecto">
                <div className={styles.row}>
                  <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
                  <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
                  <TextField label="Adicionales" placeholder="Agregar un link" {...register('additionalLinks')} />
                </div>
              </Section>

              <Section title="Estimación del Proyecto">
                <div className={styles.row}>
                  <TextField label="Fecha de inicio" type="date" disabled={isProspecto} {...register('startDate', { setValueAs: emptyToUndefined })} />
                  <TextField
                    label="Fecha de fin"
                    type="date"
                    disabled={isProspecto}
                    {...register('estimatedDeliveryDate', { setValueAs: emptyToUndefined })}
                  />
                  <TextField label="Horas" type="number" disabled={isProspecto} {...register('soldHours')} />
                </div>
                {type === 'support' && (
                  <div className={styles.row}>
                    <TextField label="Horas de soporte" type="number" {...register('supportHours')} />
                    <TextField label="Plan de soporte" placeholder="Ej: Mensual, Bolsa de horas…" {...register('supportPlanDescription')} />
                  </div>
                )}
              </Section>

              {type === 'development' && (
                <Section title="Equipos e involucrados">
                  {!equiposEnabled && <p className={styles.hint}>Disponible cuando la etapa comercial es "Aprobado".</p>}

                  <div className={styles.teamsLayout}>
                    <div className={styles.teamsAvailable}>
                      <h3 className={styles.teamsSubtitle}>Equipos disponibles</h3>
                      <div className={styles.teamsGrid}>
                        {(teams?.items ?? []).map((team) => {
                          const checked = teamFields.some((field) => field.teamId === team.id);
                          return (
                            <label
                              key={team.id}
                              className={[styles.teamCheckbox, !equiposEnabled ? styles.teamCheckboxDisabled : '']
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!equiposEnabled}
                                onChange={() => toggleTeam(team.id)}
                              />
                              {team.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {equiposEnabled && teamFields.length > 0 && (
                      <div className={styles.teamsSelected}>
                        <h3 className={styles.teamsSubtitle}>Equipos seleccionados</h3>
                        {teamFields.map((field, index) => {
                          const teamName = teams?.items.find((t) => t.id === field.teamId)?.name ?? '—';
                          return (
                            <div key={field.id} className={styles.teamDetailCard}>
                              <span className={styles.teamDetailName}>{teamName}</span>
                              <div className={styles.row}>
                                <Select
                                  label="Líder"
                                  placeholder="Sin asignar"
                                  options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                                  {...register(`teams.${index}.leaderUserId`, { setValueAs: emptyToUndefined })}
                                />
                                <TextField label="N° colaboradores" type="number" min={0} {...register(`teams.${index}.memberCount`)} />
                                <TextField label="Horas estimadas" type="number" min={0} {...register(`teams.${index}.assignedHours`)} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {hoursExceeded && (
                    <div className={styles.alert} role="alert">
                      <AlertIcon size={18} className={styles.alertIcon} />
                      <span>
                        La suma de horas estimadas de los equipos ({totalTeamHours} hrs) supera las horas asignadas al proyecto (
                        {Number(soldHours) || 0} hrs). Ajusta las horas antes de continuar.
                      </span>
                    </div>
                  )}
                </Section>
              )}

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(0)}>
                  Atrás
                </Button>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" disabled={hoursExceeded} onClick={() => void goToStep3()}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Section title="Datos Proyecto">
                <div className={styles.summaryGrid}>
                  <SummaryItem label="Nombre del proyecto" value={watch('name')} />
                  <SummaryItem label="Tipo" value={type === 'development' && salesStage ? PROJECT_SALES_STAGE_LABELS[salesStage] : PROJECT_TYPE_LABELS[type]} />
                  <SummaryItem label="Líder" value={leaderLabel} />
                  <SummaryItem label="Cotización" value={quotationLink} />
                  <SummaryItem label="Contrato" value={contractLink} />
                  <SummaryItem label="Adicionales" value={additionalLinks} />
                </div>
              </Section>

              {clientDetail && (
                <Section title="Cliente">
                  <ClientDetailCard client={clientDetail} />
                </Section>
              )}

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button type="submit" loading={isSubmitting} loadingText="Creando…">
                  Guardar y Crear Proyecto
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </DashboardLayout>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value || '—'}</span>
    </div>
  );
}
