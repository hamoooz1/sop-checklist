// src/app/AppInner.jsx
import { useEffect, useMemo, useState } from 'react';
import { MantineProvider, AppShell, Group, Select, Container, SegmentedControl, Text } from '@mantine/core';
import { useCompany } from '../hooks/useCompany';
import { useLocations } from '../hooks/useLocations';
import { useEmployeesForLocation } from '../hooks/useEmployeesForLocation';
import { useTasklistsToday } from '../hooks/useTasklistsToday';
import { useSubmissions } from '../hooks/useSubmissions';
import { useTimeBlocks } from '../hooks/useTimeBlocks';
import EmployeeView from '../components/Employee/EmployeeView';
import ManagerView from '../components/Manager/ManagerView';
import AdminView from '../components/Admin/AdminView';

export default function AppInner() {
  const { company } = useCompany();
  const tz = company?.timezone || 'UTC';
  const { locations, loading: locLoading } = useLocations();
  const [activeLocationId, setActiveLocationId] = useState('');
  useEffect(() => {
    if (!locations.length) return;
    if (!activeLocationId || !locations.find(l => l.id === activeLocationId)) {
      setActiveLocationId(locations[0].id);
    }
  }, [locations, activeLocationId]);

  const employees = useEmployeesForLocation(activeLocationId);
  const [currentEmployee, setCurrentEmployee] = useState('');
  useEffect(() => {
    if (!employees.length) { setCurrentEmployee(''); return; }
    if (!currentEmployee || !employees.find(e => (e.email||e.id) === currentEmployee)) {
      setCurrentEmployee(employees[0].email || employees[0].id);
    }
  }, [employees, currentEmployee]);

  const today = new Date().toISOString().slice(0,10);
  const tasklistsToday = useTasklistsToday(activeLocationId, today, tz);
  const timeBlocks = useTimeBlocks(); // for labels
  const submissions = useSubmissions({ locationId: activeLocationId, fromISO: today });

  const [mode, setMode] = useState('employee');

  useEffect(() => {
    // brand color live apply
    if (company?.brand_color) document.documentElement.style.setProperty('--brand', company.brand_color);
  }, [company?.brand_color]);

  const timeBlockLabel = (id) => {
    const tb = timeBlocks.find(t => t.id === id);
    return tb ? `${tb.name} (${tb.start_time}–${tb.end_time})` : id;
  };

  const employeeOptions = employees.map(u => u.email || u.id);
  const locationOptions = locations.map(l => ({ value: l.id, label: l.name }));

  return (
    <MantineProvider>
      <AppShell header={{ height: 72 }}>
        <AppShell.Header style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Group h={72} px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm">
              <div style={{ width: 28, height: 28, borderRadius: 8, background: company?.brand_color || '#0ea5e9' }} />
              <Text fw={700}>{company?.name || 'Company'}</Text>
            </Group>
            <Group gap="xs" wrap="wrap">
              <SegmentedControl
                value={mode}
                onChange={setMode}
                data={[{ value: 'employee', label: 'Employee' }, { value: 'manager', label: 'Manager' }, { value: 'admin', label: 'Admin' }]}
              />
              <Select
                value={currentEmployee}
                onChange={setCurrentEmployee}
                data={employeeOptions}
                placeholder={employees.length ? 'Select employee' : 'No employees'}
                w={220}
              />
              <Select
                value={activeLocationId}
                onChange={setActiveLocationId}
                data={locationOptions}
                w={200}
                placeholder={locLoading ? 'Loading…' : 'Select location'}
                disabled={locLoading || locations.length === 0}
              />
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Container size="xl">
            {mode === 'employee' && (
              <EmployeeView
                company={company}
                tasklists={tasklistsToday}
                timeBlockLabel={timeBlockLabel}
                activeLocationId={activeLocationId}
                currentEmployee={currentEmployee}
              />
            )}
            {mode === 'manager' && (
              <ManagerView
                submissions={submissions}
                locations={locations}
                tasklists={tasklistsToday}
                timeBlockLabel={timeBlockLabel}
              />
            )}
            {mode === 'admin' && (
              <AdminView />
            )}
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
