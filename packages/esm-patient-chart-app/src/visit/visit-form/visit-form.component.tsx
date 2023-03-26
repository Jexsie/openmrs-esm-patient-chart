import React, { useCallback, useState, useMemo, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Button,
  ButtonSet,
  ContentSwitcher,
  DatePicker,
  DatePickerInput,
  Form,
  FormGroup,
  InlineNotification,
  Layer,
  RadioButton,
  RadioButtonGroup,
  Row,
  Select,
  SelectItem,
  Stack,
  Switch,
  TimePicker,
  TimePickerSelect,
} from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { first } from 'rxjs/operators';
import {
  saveVisit,
  showNotification,
  showToast,
  useLocations,
  useSession,
  ExtensionSlot,
  NewVisitPayload,
  toOmrsIsoString,
  toDateObjectStrict,
  useLayoutType,
  useVisitTypes,
  useConfig,
  useVisit,
} from '@openmrs/esm-framework';
import {
  amPm,
  convertTime12to24,
  DefaultWorkspaceProps,
  useActivePatientEnrollment,
  PatientProgram,
} from '@openmrs/esm-patient-common-lib';
import BaseVisitType from './base-visit-type.component';
import styles from './visit-form.scss';
import { MemoizedRecommendedVisitType } from './recommended-visit-type.component';
import { ChartConfig } from '../../config-schema';
import VisitAttributeTypeFields from './visit-attribute-type.component';
import { saveQueueEntry } from '../hooks/useServiceQueue';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

const openmrsResourceSchema = z.object({
  uuid: z.string(),
  display: z.string().optional(),
  extraProperties: z.record(z.any()),
});

const enrollmentSchema = z.object({
  uuid: z.string(),
  display: z.string(),
  patient: openmrsResourceSchema,
  program: openmrsResourceSchema,
  dateEnrolled: z.string(),
  dateCompleted: z.string(),
  location: openmrsResourceSchema,
});

export type PatientEnrollment = z.infer<typeof enrollmentSchema>;

const schema = z.object({
  visitDate: z.date(),
  visitTime: z.string(),
  selectedLocation: z.string(),
  visitType: z.string(),
  enrollment: enrollmentSchema.optional(),
  contentSwitcherIndex: z.number(),
  timeFormat: z.enum(['AM', 'PM']),
});

export type FormData = z.infer<typeof schema>;

const StartVisitForm: React.FC<DefaultWorkspaceProps> = ({ patientUuid, closeWorkspace, promptBeforeClosing }) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const locations = useLocations();
  const sessionUser = useSession();
  const sessionLocation = sessionUser?.sessionLocation?.uuid;
  const config = useConfig() as ChartConfig;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const state = useMemo(() => ({ patientUuid }), [patientUuid]);
  const { activePatientEnrollment, isLoading } = useActivePatientEnrollment(patientUuid);
  const allVisitTypes = useVisitTypes();
  const [enrollment, setEnrollment] = useState<PatientProgram>(activePatientEnrollment[0]);
  const { mutate } = useVisit(patientUuid);
  const [ignoreChanges, setIgnoreChanges] = useState(true);
  const [visitAttributes, setVisitAttributes] = useState<{ [uuid: string]: string }>({});
  const [isMissingRequiredAttributes, setIsMissingRequiredAttributes] = useState(false);
  const [errorFetchingResources, setErrorFetchingResources] = useState<{
    blockSavingForm: boolean;
  }>(null);

  const {
    control,
    getValues,
    setValue,
    formState: { errors },
    handleSubmit,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'all',
    defaultValues: {
      visitDate: new Date(),
      visitTime: dayjs(new Date()).format('hh:mm'),
      timeFormat: new Date().getHours() >= 12 ? 'PM' : 'AM',
      selectedLocation: sessionLocation ? sessionLocation : '',
      enrollment: activePatientEnrollment[0],
      contentSwitcherIndex: config.showRecommendedVisitTypeTab ? 0 : 1,
      visitType: (() => {
        if (locations?.length && sessionUser?.sessionLocation?.uuid) {
          return allVisitTypes?.length === 1 ? allVisitTypes[0].uuid : null;
        }

        return null;
      })(),
    },
  });
  const visitQueueNumberAttributeUuid = config.visitQueueNumberAttributeUuid;

  const onSubmit = useCallback(
    (data: FormData, event) => {
      const { visitDate, visitTime, selectedLocation, visitType, timeFormat } = data;

      if (config.visitAttributeTypes?.find(({ uuid, required }) => required && !visitAttributes[uuid])) {
        setIsMissingRequiredAttributes(true);
        return;
      }

      setIsSubmitting(true);

      const [hours, minutes] = convertTime12to24(visitTime, timeFormat);

      const payload: NewVisitPayload = {
        patient: patientUuid,
        startDatetime: toDateObjectStrict(
          toOmrsIsoString(
            new Date(dayjs(visitDate).year(), dayjs(visitDate).month(), dayjs(visitDate).date(), hours, minutes),
          ),
        ),
        visitType: visitType,
        location: selectedLocation,
        attributes: Object.entries(visitAttributes)
          .filter(([key, value]) => !!value)
          .map(([key, value]) => ({
            attributeType: key,
            value,
          })),
      };

      const abortController = new AbortController();
      saveVisit(payload, abortController)
        .pipe(first())
        .subscribe(
          (response) => {
            if (response.status === 201) {
              if (config.showServiceQueueFields) {
                // retrieve values from queue extension

                const queueLocation = event?.target['queueLocation']?.value;
                const serviceUuid = event?.target['service']?.value;
                const priority = event?.target['priority']?.value;
                const status = event?.target['status']?.value;
                const sortWeight = event?.target['sortWeight']?.value;

                saveQueueEntry(
                  response.data.uuid,
                  serviceUuid,
                  patientUuid,
                  priority,
                  status,
                  sortWeight,
                  new AbortController(),
                  queueLocation,
                  visitQueueNumberAttributeUuid,
                ).then(
                  ({ status }) => {
                    if (status === 201) {
                      mutate();
                      showToast({
                        kind: 'success',
                        title: t('visitStarted', 'Visit started'),
                        description: t(
                          'queueAddedSuccessfully',
                          `Patient has been added to the queue successfully.`,
                          `${hours} : ${minutes}`,
                        ),
                      });
                    }
                  },
                  (error) => {
                    showNotification({
                      title: t('queueEntryError', 'Error adding patient to the queue'),
                      kind: 'error',
                      critical: true,
                      description: error?.message,
                    });
                  },
                );
              }
              mutate();
              closeWorkspace();

              showToast({
                critical: true,
                kind: 'success',
                description: t(
                  'visitStartedSuccessfully',
                  `${response?.data?.visitType?.display} started successfully`,
                ),
                title: t('visitStarted', 'Visit started'),
              });
            }
          },
          (error) => {
            showNotification({
              title: t('startVisitError', 'Error starting visit'),
              kind: 'error',
              critical: true,
              description: error?.message,
            });
          },
        );
    },
    [
      closeWorkspace,
      config.visitAttributeTypes,
      config.showServiceQueueFields,
      visitQueueNumberAttributeUuid,
      mutate,
      patientUuid,
      t,
      visitAttributes,
      setIsMissingRequiredAttributes,
    ],
  );

  const handleOnChange = () => {
    setIgnoreChanges((prevState) => !prevState);
    promptBeforeClosing(() => true);
  };

  return (
    <Form className={styles.form} onChange={handleOnChange} onSubmit={handleSubmit(onSubmit)}>
      {errorFetchingResources && (
        <InlineNotification
          kind={errorFetchingResources?.blockSavingForm ? 'error' : 'warning'}
          lowContrast
          className={styles.inlineNotification}
          title={t('partOfFormDidntLoad', 'Part of the form did not load')}
          subtitle={t('refreshToTryAgain', 'Please refresh to try again')}
        />
      )}
      <div>
        {isTablet && (
          <Row className={styles.headerGridRow}>
            <ExtensionSlot extensionSlotName="visit-form-header-slot" className={styles.dataGridRow} state={state} />
          </Row>
        )}
        <Stack gap={1} className={styles.container}>
          {/* Date and time of visit. Defaults to the current date and time. */}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t('dateAndTimeOfVisit', 'Date and time of visit')}</div>
            <div className={styles.dateTimeSection}>
              <Controller
                control={control}
                name="visitDate"
                render={({ field: { onBlur, onChange, value } }) => (
                  <DatePicker
                    dateFormat="d/m/Y"
                    datePickerType="single"
                    id="visitDate"
                    light={isTablet}
                    style={{ paddingBottom: '1rem' }}
                    maxDate={new Date().toISOString()}
                    onChange={([date]) => onChange(date)}
                    onBlur={onBlur}
                    value={value}
                  >
                    <DatePickerInput
                      id="visitStartDateInput"
                      labelText={t('date', 'Date')}
                      placeholder="dd/mm/yyyy"
                      style={{ width: '100%' }}
                    />
                  </DatePicker>
                )}
              />
              <ResponsiveWrapper isTablet={isTablet}>
                <Controller
                  control={control}
                  name="visitTime"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <TimePicker
                      id="visitStartTime"
                      labelText={t('time', 'Time')}
                      onChange={(event) => onChange(event.target.value as amPm)}
                      onBlur={onBlur}
                      pattern="^(1[0-2]|0?[1-9]):([0-5]?[0-9])$"
                      style={{ marginLeft: '0.125rem', flex: 'none' }}
                      value={value}
                    >
                      <Controller
                        control={control}
                        name="timeFormat"
                        render={({ field: { onBlur, onChange, value } }) => (
                          <TimePickerSelect
                            id="visitStartTimeSelect"
                            onChange={(event) => onChange(event.target.value as amPm)}
                            value={value}
                            onBlur={onBlur}
                            aria-label={t('time', 'Time')}
                          >
                            <SelectItem value="AM" text="AM" />
                            <SelectItem value="PM" text="PM" />
                          </TimePickerSelect>
                        )}
                      />
                    </TimePicker>
                  )}
                />
              </ResponsiveWrapper>
            </div>
          </section>

          {/* This field lets the user select a location for the visit. The location is required for the visit to be saved. Defaults to the active session location */}
          <section>
            <div className={styles.sectionTitle}>{t('visitLocation', 'Visit Location')}</div>
            <div className={styles.selectContainer}>
              <Controller
                control={control}
                name="selectedLocation"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Select
                    labelText={t('selectLocation', 'Select a location')}
                    light={isTablet}
                    id="location"
                    invalidText="Required"
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={onBlur}
                    value={value}
                  >
                    {!getValues('selectedLocation') ? (
                      <SelectItem text={t('selectOption', 'Select an option')} value="" />
                    ) : null}
                    {locations?.length > 0 &&
                      locations.map((location) => (
                        <SelectItem key={location.uuid} text={location.display} value={location.uuid}>
                          {location.display}
                        </SelectItem>
                      ))}
                  </Select>
                )}
              />
            </div>
          </section>

          {/* Lists available program types. This feature is dependent on the `showRecommendedVisitTypeTab` config being set
          to true. */}
          {config.showRecommendedVisitTypeTab && (
            <section>
              <div className={styles.sectionTitle}>{t('program', 'Program')}</div>
              <FormGroup legendText={t('selectProgramType', 'Select program type')}>
                <Controller
                  control={control}
                  name="enrollment"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <RadioButtonGroup
                      defaultSelected={getValues('enrollment')?.program?.uuid ?? ''}
                      orientation="vertical"
                      onChange={(uuid) =>
                        onChange(activePatientEnrollment.find(({ program }) => program.uuid === uuid))
                      }
                      valueSelected={value}
                      onBlur={onBlur}
                      name="program-type-radio-group"
                    >
                      {activePatientEnrollment.map(({ uuid, display, program }) => (
                        <RadioButton
                          key={uuid}
                          className={styles.radioButton}
                          id={uuid}
                          labelText={display}
                          value={program.uuid}
                        />
                      ))}
                    </RadioButtonGroup>
                  )}
                />
              </FormGroup>
            </section>
          )}

          {/* Lists available visit types. The content switcher only gets shown when recommended visit types are enabled */}
          <section>
            <div className={styles.sectionTitle}>{t('visitType', 'Visit Type')}</div>

            {config.showRecommendedVisitTypeTab ? (
              <>
                <Controller
                  control={control}
                  name="contentSwitcherIndex"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <ContentSwitcher selectedIndex={value} onChange={({ index }) => onChange(index)} onBlur={onBlur}>
                      <Switch name="recommended" text={t('recommended', 'Recommended')} />
                      <Switch name="all" text={t('all', 'All')} />
                    </ContentSwitcher>
                  )}
                />
                {getValues('contentSwitcherIndex') === 0 && !isLoading && (
                  <MemoizedRecommendedVisitType
                    control={control}
                    setValue={setValue}
                    patientUuid={patientUuid}
                    patientProgramEnrollment={getValues('enrollment')}
                    locationUuid={getValues('selectedLocation')}
                  />
                )}
                {getValues('contentSwitcherIndex') === 1 && (
                  <BaseVisitType
                    control={control}
                    setValue={setValue}
                    visitTypes={allVisitTypes}
                    patientUuid={patientUuid}
                  />
                )}
              </>
            ) : (
              // Defaults to showing all possible visit types if recommended visits are not enabled
              <BaseVisitType
                control={control}
                setValue={setValue}
                visitTypes={allVisitTypes}
                patientUuid={patientUuid}
              />
            )}
          </section>

          {errors.visitType?.message && (
            <section>
              <InlineNotification
                role="alert"
                style={{ margin: '0', minWidth: '100%' }}
                kind="error"
                lowContrast={true}
                title={t('missingVisitType', 'Missing visit type')}
                subtitle={t('selectVisitType', 'Please select a Visit Type')}
              />
            </section>
          )}

          {/* Visit type attribute fields. These get shown when visit attribute types are configured */}
          <section>
            <VisitAttributeTypeFields
              setVisitAttributes={setVisitAttributes}
              isMissingRequiredAttributes={isMissingRequiredAttributes}
              visitAttributes={visitAttributes}
              setErrorFetchingResources={setErrorFetchingResources}
            />
          </section>

          {/* Queue location and queue fields. These get shown when queue location and queue fields are configured */}
          {config.showServiceQueueFields && <ExtensionSlot extensionSlotName="add-queue-entry-slot" />}
        </Stack>
      </div>
      <ButtonSet className={isTablet ? styles.tablet : styles.desktop}>
        <Button className={styles.button} kind="secondary" onClick={() => closeWorkspace(ignoreChanges)}>
          {t('discard', 'Discard')}
        </Button>
        <Button
          className={styles.button}
          disabled={isSubmitting || errorFetchingResources?.blockSavingForm}
          kind="primary"
          type="submit"
        >
          {t('startVisit', 'Start visit')}
        </Button>
      </ButtonSet>
    </Form>
  );
};

function ResponsiveWrapper({ children, isTablet }: { children: React.ReactNode; isTablet: boolean }) {
  return isTablet ? <Layer>{children} </Layer> : <>{children}</>;
}

export default StartVisitForm;
