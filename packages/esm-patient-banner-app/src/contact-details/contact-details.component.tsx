import React from 'react';
import { useTranslation } from 'react-i18next';
import { InlineLoading } from '@carbon/react';
import { ConfigurableLink, navigate, parseDate, useConfig, useLayoutType } from '@openmrs/esm-framework';
import { useRelationships } from './relationships.resource';
import { usePatientContactAttributes } from '../hooks/usePatientAttributes';
import { usePatientListsForPatient } from '../hooks/usePatientListsForPatient';
import { ConfigObject } from '../config-schema';
import styles from './contact-details.scss';

interface ContactDetailsProps {
  address: Array<fhir.Address>;
  telecom: Array<fhir.ContactPoint>;
  patientId: string;
  deceased: boolean;
  isPatientBannerSmallSize: boolean;
}

const PatientLists: React.FC<{ patientUuid: string }> = ({ patientUuid }) => {
  const { cohorts, isLoading } = usePatientListsForPatient(patientUuid);
  const { t } = useTranslation();

  if (isLoading) {
    return <InlineLoading />;
  }

  if (cohorts?.length > 0) {
    const sorted = cohorts.sort((a, b) => parseDate(a.startDate).getTime() - parseDate(b.startDate).getTime());
    const slicedLists = sorted.slice(0, 3);
    return (
      <>
        <p className={styles.heading}>
          {t('patientLists', 'Patient Lists ({totalLists})', {
            totalLists: cohorts.length,
          })}
        </p>
        <ul>
          {slicedLists.map((cohort) => (
            <li>
              <ConfigurableLink to={`${window.spaBase}/home/patient-lists/${cohort.uuid}`} key={cohort.uuid}>
                {cohort.name}
              </ConfigurableLink>
            </li>
          ))}
          <li>
            <ConfigurableLink to={`${window.spaBase}/home/patient-lists`}>
              {cohorts.length > 3
                ? t('seeMore', 'See {moreLists} more', {
                    moreLists: cohorts?.length - 3,
                  })
                : ''}
            </ConfigurableLink>
          </li>
        </ul>
      </>
    );
  }

  return (
    <>
      <p className={styles.heading}>
        {t('patientLists', 'Patient Lists ({totalLists})', {
          totalLists: cohorts.length,
        })}
      </p>
      <p>--</p>
    </>
  );
};

const Address: React.FC<{ address?: fhir.Address }> = ({ address }) => {
  const { t } = useTranslation();
  const { useCustomAddressLabel } = useConfig<ConfigObject>();
  const useCustomAddressLabelEnabled = useCustomAddressLabel?.enabled;
  const customAddressLabel = useCustomAddressLabel?.customAddressLabel;

  const getAddressKey = (url) => url.split('#')[1];
  /*
    DO NOT REMOVE THIS COMMENT UNLESS YOU UNDERSTAND WHY IT IS HERE

    t('postalCode', 'Postal code')
    t('address1', 'Address line 1')
    t('address2', 'Address line 2')
    t('countyDistrict', 'District')
    t('stateProvince', 'State')
    t('cityVillage', 'City')
    t('country', 'Country')
    t('countyDistrict', 'District')
    t('state', 'State')
    t('city', 'City')
    t('district', 'District')
  */

  return (
    <>
      <p className={styles.heading}>{t('address', 'Address')}</p>
      <ul>
        {address ? (
          <>
            {Object.entries(address)
              .filter(([key]) => !['use', 'id'].some((k) => k === key))
              .map(([key, value]) =>
                key === 'extension' ? (
                  address?.extension[0]?.extension.map((add, i) => (
                    <li key={`address-${key}-${i}`}>
                      {useCustomAddressLabelEnabled
                        ? t(customAddressLabel[getAddressKey(add.url)])
                        : t(getAddressKey(add.url))}
                      : {add.valueString}
                    </li>
                  ))
                ) : (
                  <li>
                    {useCustomAddressLabelEnabled ? t(customAddressLabel[key]) : t(key)}: {value}
                  </li>
                ),
              )}
          </>
        ) : (
          '--'
        )}
      </ul>
    </>
  );
};

const Contact: React.FC<{ telecom: Array<fhir.ContactPoint>; patientUuid: string; deceased?: boolean }> = ({
  telecom,
  patientUuid,
}) => {
  const { t } = useTranslation();
  const value = telecom?.length ? telecom[0].value : '--';
  const { isLoading, contactAttributes } = usePatientContactAttributes(patientUuid);

  return (
    <>
      <p className={styles.heading}>{t('contactDetails', 'Contact Details')}</p>
      <ul>
        <li>{value}</li>
        {isLoading ? (
          <InlineLoading description={`${t('loading', 'Loading')} ...`} />
        ) : (
          contactAttributes?.map(({ attributeType, value, uuid }) => (
            <li key={uuid}>
              {attributeType.display} : {value}
            </li>
          ))
        )}
      </ul>
    </>
  );
};

const Relationships: React.FC<{ patientId: string }> = ({ patientId }) => {
  const { t } = useTranslation();
  const { data: relationships, isLoading } = useRelationships(patientId);

  const extractName = (display: string) => {
    const pattern = /-\s*(.*)$/;
    const match = display.match(pattern);
    if (match && match.length > 1) {
      return match[1].trim();
    }
    return display.trim();
  };

  return (
    <>
      <p className={styles.heading}>{t('relationships', 'Relationships')}</p>
      <>
        {(() => {
          if (isLoading) return <InlineLoading description="Loading..." role="progressbar" />;
          if (relationships?.length) {
            return (
              <ul>
                {relationships.map((r) => (
                  <li key={r.uuid} className={styles.relationship}>
                    <div>{extractName(r.display)}</div>
                    <div>{r.relationshipType}</div>
                    <div>
                      {`${r.relativeAge ? r.relativeAge : '--'} ${
                        r.relativeAge ? (r.relativeAge === 1 ? 'yr' : 'yrs') : ''
                      }`}
                    </div>
                  </li>
                ))}
              </ul>
            );
          }
          return <p>--</p>;
        })()}
      </>
    </>
  );
};

const ContactDetails: React.FC<ContactDetailsProps> = ({
  address,
  telecom,
  patientId,
  deceased,
  isPatientBannerSmallSize,
}) => {
  const currentAddress = address?.find((a) => a.use === 'home');
  const currentClass = `${styles[deceased && 'deceased']} ${
    styles[isPatientBannerSmallSize ? 'smallBannerSize' : 'contactDetailsContainer']
  }`;
  return (
    <div className={currentClass}>
      <div className={styles.row}>
        <div className={styles.col}>
          <Address address={currentAddress} />
        </div>
        <div className={styles.col}>
          <Contact telecom={telecom} patientUuid={patientId} />
        </div>
      </div>
      <div className={styles.row}>
        <div className={styles.col}>
          <Relationships patientId={patientId} />
        </div>
        <div className={styles.col}>
          <PatientLists patientUuid={patientId} />
        </div>
      </div>
    </div>
  );
};

export default ContactDetails;
