import React from 'react';
import { screen, render, waitFor, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePagination, useVisitTypes } from '@openmrs/esm-framework';
import { mockVisitTypes } from '../../../../../__mocks__/visits.mock';
import BaseVisitType from './base-visit-type.component';
import { useForm } from 'react-hook-form';
import { FormData } from './visit-form.component';

jest.mock('lodash-es/debounce', () => jest.fn((fn) => fn));

const mockUsePagination = usePagination as jest.Mock;
const mockUseVisitTypes = useVisitTypes as jest.Mock;
const mockGoToPage = jest.fn();
const { result } = renderHook(() => useForm<FormData>());
const mockedControl = result.current.control;
const mockedSetValue = result.current.setValue;

jest.mock('@openmrs/esm-framework', () => ({
  ...(jest.requireActual('@openmrs/esm-framework') as any),
  usePagination: jest.fn(),
  useVisitTypes: jest.fn(),
}));

describe('VisitTypeOverview', () => {
  const renderVisitTypeOverview = () => {
    mockUsePagination.mockReturnValue({
      results: mockVisitTypes.slice(0, 2),
      goTo: mockGoToPage,
      currentPage: 1,
    });
    mockUseVisitTypes.mockReturnValue(mockVisitTypes);
    render(
      <BaseVisitType
        control={mockedControl}
        setValue={mockedSetValue}
        visitTypes={mockVisitTypes}
        patientUuid="some-patient-uuid"
      />,
    );
  };

  it('should be able to search for a visit type', async () => {
    const user = userEvent.setup();

    renderVisitTypeOverview();

    const hivVisit = screen.getByRole('radio', { name: /HIV Return Visit/i });
    const outpatientVisit = screen.getByRole('radio', { name: /Outpatient Visit/i });

    expect(outpatientVisit).toBeInTheDocument();
    expect(hivVisit).toBeInTheDocument();

    const searchInput = screen.getByRole('searchbox');
    await waitFor(() => user.type(searchInput, 'HIV'));

    expect(outpatientVisit).toBeEmptyDOMElement();
    expect(hivVisit).toBeInTheDocument();
  });
});
