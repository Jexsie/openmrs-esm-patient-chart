import React from 'react';
import { StructuredListSkeleton } from '@carbon/react';
import { PatientProgram } from '@openmrs/esm-patient-common-lib';
import { useRecommendedVisitTypes } from '../hooks/useRecommendedVisitTypes';
import BaseVisitType from './base-visit-type.component';
import { Control, UseFormSetValue } from 'react-hook-form';
import { FormData, PatientEnrollment } from './visit-form.component';

interface RecommendedVisitTypeProp {
  patientUuid: string;
  patientProgramEnrollment: PatientEnrollment;
  locationUuid: string;
  control: Control<FormData>;
  setValue: UseFormSetValue<FormData>;
}

const RecommendedVisitType: React.FC<RecommendedVisitTypeProp> = ({
  patientUuid,
  patientProgramEnrollment,
  setValue,
  control,
  locationUuid,
}) => {
  const { recommendedVisitTypes, error, isLoading } = useRecommendedVisitTypes(
    patientUuid,
    patientProgramEnrollment?.uuid,
    patientProgramEnrollment?.program?.uuid,
    locationUuid,
  );

  return (
    <div style={{ marginTop: '0.625rem' }}>
      {isLoading ? (
        <StructuredListSkeleton />
      ) : (
        <BaseVisitType
          control={control}
          setValue={setValue}
          visitTypes={recommendedVisitTypes}
          patientUuid={patientUuid}
        />
      )}
    </div>
  );
};

export const MemoizedRecommendedVisitType = React.memo(RecommendedVisitType);
