import React, { useMemo, useState, useEffect, useCallback, Suspense, lazy } from "react";
const AdminView = lazy(() => import("./AdminView"));
import { MantineProvider, createTheme, AppShell, Container, Group, Button, Select, Card, Text, Badge, Table, Grid, Stack, NumberInput, TextInput, Modal, ActionIcon, ScrollArea, FileButton, Switch, SegmentedControl, rem, Tabs, Center, Loader, Drawer, Burger, Divider, Collapse, Textarea, Popover, Skeleton, useMantineColorScheme, useComputedColorScheme, Avatar } from "@mantine/core";

import { supabase } from "./lib/supabase.js";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";
import {
  fetchSubmissionAndTasks,
  validatePin,
  findOrCreateSubmission,
  upsertSubmissionTask,
  todayISOInTz,
  uploadEvidence,
  toPublicUrl,         // <-- add
} from './lib/submissions';
import { useLocalStorage, useDisclosure } from "@mantine/hooks";
import {
  IconSun, IconMoon, IconPhoto, IconCheck, IconUpload, IconMapPin, IconUser,
  IconLayoutGrid, IconLayoutList, IconBug, IconLogout, IconShieldHalf, IconFilter,
  IconChevronDown, IconChevronRight, IconListCheck, IconShoppingCart
} from "@tabler/icons-react";
import { getMyCompanyId } from "./lib/company"; // [COMPANY_SCOPE]
import fetchUsers, { fetchLocations, getCompany, listTimeBlocks, listTasklistTemplates, listRestockRequests, completeRestockRequest } from "./lib/queries.js";
import BugReport from "./components/BugReport.jsx";
import RestockRequestForm from "./components/restock/RestockRequestForm.jsx";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** ---------------------- Utils ---------------------- */

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function PhotoThumbs({ urls = [], size = 64, title = "Photo" }) {
  const [open, setOpen] = React.useState(false);
  const [src, setSrc] = React.useState(null);

  return (
    <>
      <Group gap="xs" wrap="wrap">
        {urls.map((u, i) => (
          <img
            key={i}
            src={u}
            alt={`evidence-${i}`}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.opacity = '0.35';
              e.currentTarget.title = `Failed to load\n${u}`;
            }}
            style={{
              width: size, height: size, objectFit: 'cover',
              borderRadius: 6, border: '1px solid var(--mantine-color-gray-3)',
              cursor: 'pointer'
            }}
            loading="lazy"
            onClick={() => { setSrc(u); setOpen(true); }}
          />
        ))}
      </Group>

      <Modal opened={open} onClose={() => setOpen(false)} title={title} centered size="auto" styles={{ body: { padding: 0 } }}>
        {src && (
          <img
            src={src}
            alt="evidence-full"
            style={{ maxWidth: '90vw', maxHeight: '80vh', display: 'block' }}
          />
        )}
      </Modal>
    </>
  );
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function canTaskBeCompleted(task, state) {
  if (!state) return false;
  if (state.na) return true;
  if (task.photoRequired && (!state.photos || state.photos.length === 0)) return false;
  if (task.noteRequired && (!state.note || state.note.trim() === "")) return false;
  if (task.inputType === "number") {
    const v = state.value;
    const isNum = typeof v === "number" && !Number.isNaN(v);
    if (!isNum) return false;
    if (typeof task.min === "number" && v < task.min) return false;
    if (typeof task.max === "number" && v > task.max) return false;
  }
  return true;
}

// --------- Checklist resolution (templates + ad-hoc) ----------
function weekdayIndexFromISO(dateISO, tz) {
  try {
    const parts = dateISO.split("-");
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
    if (tz) {
      // Get weekday in target timezone using Intl
      const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz });
      const wk = fmt.format(d); // Sun, Mon, ...
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wk);
    }
    return d.getUTCDay();
  } catch {
    return new Date().getDay();
  }
}

function getTimeBlockLabelFromLists(blocks, id) {
  const b = (blocks || []).find(tb => tb.id === id);
  return b ? `${b.name} (${b.start}–${b.end})` : id;
}

/** ---------------------- Theme toggle (prop-driven) ---------------------- */
function ThemeToggle({ scheme, setScheme }) {
  const next = scheme === "dark" ? "light" : "dark";
  return (
    <ActionIcon
      variant="default"
      radius="md"
      size="lg"
      onClick={() => setScheme(next)}
      aria-label="Toggle color scheme"
      title="Toggle color scheme"
    >
      {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

function EmployeeFiltersForm({ positionFilter, setPositionFilter, templates, onClose }) {
  const [localPositionFilter, setLocalPositionFilter] = useState(positionFilter);
  
  // Update local state when positionFilter prop changes
  useEffect(() => {
    setLocalPositionFilter(positionFilter);
  }, [positionFilter]);
  
  const positionOptions = useMemo(() => 
    Array.from(
      new Set((templates || []).flatMap(t => Array.isArray(t.positions) ? t.positions.map(String) : []))
    ).filter(Boolean).map(p => ({ value: p, label: p })),
    [templates]
  );

  const handleApply = useCallback(() => {
    setPositionFilter(localPositionFilter);
    onClose();
  }, [localPositionFilter, setPositionFilter, onClose]);

  const handleClear = useCallback(() => {
    setLocalPositionFilter("");
    setPositionFilter("");
    onClose();
  }, [setPositionFilter, onClose]);

  const handleSelectChange = useCallback((v) => {
    setLocalPositionFilter(v || "");
  }, []);

  return (
    <Stack gap="sm" p="xs" style={{ minWidth: 280 }}>
      <Text fw={600}>Filters</Text>
      <Select
        label="Position"
        placeholder="All positions"
        value={localPositionFilter}
        onChange={handleSelectChange}
        data={positionOptions}
        clearable
        searchable
        comboboxProps={{ withinPortal: false }}
      />
      <Group justify="space-between" mt="xs">
        <Button variant="light" onClick={handleClear}>Clear</Button>
        <Button onClick={handleApply}>Apply</Button>
      </Group>
    </Stack>
  );
}

/** ---------------------- PIN Pad Component ---------------------- */
function PinPad({ onNumberClick, onBackspace, onClear }) {
  const { colorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  const isDark = computed === 'dark';

  const handleClick = (value) => {
    if (value === 'backspace') {
      onBackspace?.();
    } else if (value === 'clear') {
      onClear?.();
    } else {
      onNumberClick?.(value);
    }
  };

  const buttonStyles = {
    root: {
      height: 72,
      fontSize: '1.75rem',
      fontWeight: 400,
      backgroundColor: isDark ? '#2c2c2c' : '#ffffff',
      color: isDark ? '#ffffff' : '#1a1a1a',
      border: isDark ? '1px solid #404040' : '1px solid #e5e5e5',
      borderRadius: '12px',
      boxShadow: isDark ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.15s ease',
      '&:hover': {
        backgroundColor: isDark ? '#353535' : '#ffffff',
        border: isDark ? '1px solid #404040' : '1px solid #e5e5e5',
      },
      '&:active': {
        backgroundColor: isDark ? '#353535' : '#ffffff',
      }
    }
  };

  const actionButtonStyles = {
    root: {
      height: 72,
      fontSize: '1.25rem',
      fontWeight: 400,
      backgroundColor: isDark ? '#2c2c2c' : '#ffffff',
      color: isDark ? '#b0b0b0' : '#666666',
      border: isDark ? '1px solid #404040' : '1px solid #e5e5e5',
      borderRadius: '12px',
      boxShadow: isDark ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.15s ease',
      '&:hover': {
        backgroundColor: isDark ? '#353535' : '#ffffff',
        border: isDark ? '1px solid #404040' : '1px solid #e5e5e5',
      },
      '&:active': {
        backgroundColor: isDark ? '#353535' : '#ffffff',
      }
    }
  };

  return (
    <Grid gutter={12}>
      {[1, 2, 3].map(num => (
        <Grid.Col key={num} span={4}>
          <Button
            onClick={() => handleClick(num)}
            fullWidth
            styles={buttonStyles}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.96)';
              e.currentTarget.style.boxShadow = '0 0 0 rgba(0, 0, 0, 0.08)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
            }}
          >
            {num}
          </Button>
        </Grid.Col>
      ))}
      {[4, 5, 6].map(num => (
        <Grid.Col key={num} span={4}>
          <Button
            onClick={() => handleClick(num)}
            fullWidth
            styles={buttonStyles}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.96)';
              e.currentTarget.style.boxShadow = '0 0 0 rgba(0, 0, 0, 0.08)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
            }}
          >
            {num}
          </Button>
        </Grid.Col>
      ))}
      {[7, 8, 9].map(num => (
        <Grid.Col key={num} span={4}>
          <Button
            onClick={() => handleClick(num)}
            fullWidth
            styles={buttonStyles}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.96)';
              e.currentTarget.style.boxShadow = '0 0 0 rgba(0, 0, 0, 0.08)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
            }}
          >
            {num}
          </Button>
        </Grid.Col>
      ))}
      <Grid.Col span={4}>
        <Button
          onClick={() => handleClick('clear')}
          fullWidth
          styles={actionButtonStyles}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)';
            e.currentTarget.style.boxShadow = '0 0 0 rgba(0, 0, 0, 0.08)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
          }}
        >
          Clear
        </Button>
      </Grid.Col>
      <Grid.Col span={4}>
        <Button
          onClick={() => handleClick(0)}
          fullWidth
          styles={buttonStyles}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)';
            e.currentTarget.style.boxShadow = '0 0 0 rgba(0, 0, 0, 0.08)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
          }}
        >
          0
        </Button>
      </Grid.Col>
      <Grid.Col span={4}>
        <Button
          onClick={() => handleClick('backspace')}
          fullWidth
          styles={actionButtonStyles}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)';
            e.currentTarget.style.boxShadow = '0 0 0 rgba(0, 0, 0, 0.08)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
          }}
        >
          ⌫
        </Button>
      </Grid.Col>
    </Grid>
  );
}

/** ---------------------- Pin Modal ---------------------- */
function PinDialog({ opened, onClose, onConfirm }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { colorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  const isDark = computed === 'dark';

  // Clear when the modal opens
  useEffect(() => {
    if (opened) {
      setPin('');
      setError('');
    }
  }, [opened]);

  const handleClose = () => {
    setPin('');
    setError('');
    onClose?.();
  };

  const handleNumberClick = (num) => {
    if (pin.length < 6) {
      setPin(prev => prev + String(num));
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleConfirm = () => {
    if (pin.length === 0) {
      setError('Please enter a PIN');
      return;
    }
    const p = pin;
    setPin('');              // clear immediately so it never "sticks"
    setError('');
    onConfirm?.(p);
  };

  // Handle keyboard input as fallback
  const handleKeyPress = (e) => {
    if (e.key >= '0' && e.key <= '9') {
      handleNumberClick(e.key);
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const modalBg = isDark ? '#1a1a1a' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#666666';
  const dotFilled = isDark ? '#ffffff' : '#1a1a1a';
  const dotEmpty = isDark ? '#404040' : '#e5e5e5';
  const confirmBg = pin.length > 0 ? (isDark ? '#ffffff' : '#1a1a1a') : (isDark ? '#2c2c2c' : '#e5e5e5');
  const confirmColor = pin.length > 0 ? (isDark ? '#1a1a1a' : '#ffffff') : (isDark ? '#666666' : '#999999');
  const cancelColor = isDark ? '#b0b0b0' : '#666666';
  const cancelHover = isDark ? '#2c2c2c' : '#f5f5f5';

  return (
    <Modal 
      opened={opened} 
      onClose={handleClose} 
      title={null}
      centered
      size="sm"
      withCloseButton={false}
      closeOnClickOutside={false}
      styles={{
        content: {
          maxWidth: 360,
          padding: '32px 24px',
          backgroundColor: modalBg,
        },
        body: {
          padding: 0,
          backgroundColor: modalBg,
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }
      }}
    >
      <Stack gap={32} style={{ backgroundColor: modalBg }}>
        {/* PIN Display */}
        <Center>
          <Stack gap={16} align="center">
            <Text 
              size="lg" 
              fw={500} 
              style={{ 
                letterSpacing: '0.5px',
                color: textColor,
              }}
            >
              Enter PIN
            </Text>
            <Group gap={12} justify="center">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: i < pin.length ? dotFilled : dotEmpty,
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </Group>
          </Stack>
        </Center>

        {/* Hidden input for keyboard support */}
        <TextInput
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pin}
          onChange={(e) => {
            const value = e.currentTarget.value.replace(/\D/g, '').slice(0, 6);
            setPin(value);
            setError('');
          }}
          onKeyDown={handleKeyPress}
          autoFocus
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          tabIndex={-1}
        />

        {/* Error message */}
        {error && (
          <Text size="sm" ta="center" style={{ minHeight: 20, color: '#ff6b6b' }}>{error}</Text>
        )}

        {/* PIN Pad */}
        <PinPad
          onNumberClick={handleNumberClick}
          onBackspace={handleBackspace}
          onClear={handleClear}
        />

        {/* Action buttons */}
        <Group justify="flex-end" gap={12}>
          <Button 
            variant="subtle" 
            onClick={handleClose}
            styles={{
              root: {
                backgroundColor: 'transparent',
                color: cancelColor,
                fontWeight: 400,
                '&:hover': {
                  backgroundColor: cancelHover,
                }
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={pin.length === 0}
            styles={{
              root: {
                backgroundColor: confirmBg,
                color: confirmColor,
                fontWeight: 400,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: confirmBg,
                },
                '&:disabled': {
                  backgroundColor: isDark ? '#2c2c2c' : '#e5e5e5',
                  color: isDark ? '#666666' : '#999999',
                }
              }
            }}
          >
            Confirm
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** ---------------------- Evidence ---------------------- */
function EvidenceRow({ state }) {
  if (!state) return null;
  const paths = Array.isArray(state.photos) ? state.photos : [];
  const urls = paths
    .filter(p => typeof p === 'string' && p.includes('/')) // guard against "file.name"
    .map(p => toPublicUrl(supabase, 'evidence', p));
  return (
    <Stack gap="xs" mt="xs">
      {urls.length > 0 && <PhotoThumbs urls={urls} size={56} title="Evidence" />}

      <Group gap="xs" wrap="wrap">
        {state.note ? <Badge variant="light">Note: {state.note}</Badge> : null}
        {(state.value ?? null) !== null ? <Badge variant="light">Value: {state.value}</Badge> : null}
        {state.na ? <Badge variant="light" color="gray">N/A</Badge> : null}
      </Group>
    </Stack>
  );
}

/** ---------------------- Task Grouping Components ---------------------- */
function TaskGroup({ title, tasks, tasklist, states, onToggleTask, isTaskOpen, updateTaskState, handleComplete, handleUpload, getTimeBlockLabel, signoff, groupBy }) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const { colorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  const isDark = computed === 'dark';
  
  const completedCount = tasks.filter(task => {
    const state = states.find(s => s.taskId === task.id);
    return state?.status === "Complete" || state?.na;
  }).length;
  
  const totalCount = tasks.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  // Check if all tasks in this group can be submitted
  const canSubmit = tasks.every((task) => {
    const state = states.find((s) => s.taskId === task.id);
    return (state?.status === "Complete" || state?.na) && canTaskBeCompleted(task, state);
  });
  
  return (
    <Card withBorder radius="lg" shadow="sm" style={{ marginBottom: '1rem' }}>
      <Card.Section withBorder inheritPadding py="sm" style={{ 
        background: progressPercentage === 100 
          ? (isDark ? 'var(--mantine-color-green-9)' : 'var(--mantine-color-green-0)')
          : (isDark ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-1)'),
        borderColor: progressPercentage === 100 
          ? 'var(--mantine-color-green-6)' 
          : (isDark ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-4)')
      }}>
        <Group justify="space-between" align="center">
          <Group gap="sm" align="center">
            <ActionIcon
              variant="subtle"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label="Toggle group"
            >
              {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            </ActionIcon>
            <div>
              <Text fw={600} size="md" c={isDark ? "white" : "dark"}>{title}</Text>
              <Text c={isDark ? "gray.3" : "dimmed"} size="sm">
                {getTimeBlockLabel && getTimeBlockLabel(tasklist.timeBlockId)}
              </Text>
            </div>
          </Group>
          <Group gap="sm" align="center">
            <div style={{ textAlign: 'right' }}>
              <Text size="sm" c={isDark ? "gray.3" : "dimmed"}>Progress</Text>
              <Text fw={600} size="lg" c={progressPercentage === 100 ? (isDark ? "green.1" : "green.8") : (isDark ? "blue.1" : "blue.8")}>
                {completedCount}/{totalCount} ({progressPercentage}%)
              </Text>
            </div>
            <div style={{ 
              width: 60, 
              height: 60, 
              borderRadius: '50%', 
              background: `conic-gradient(${progressPercentage === 100 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-blue-6)'} ${progressPercentage * 3.6}deg, var(--mantine-color-gray-3) 0deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--mantine-color-body)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text size="xs" fw={600} c={progressPercentage === 100 ? (isDark ? "green.1" : "green.8") : (isDark ? "blue.1" : "blue.8")}>
                  {progressPercentage}%
                </Text>
              </div>
            </div>
            {/* Sign & Submit button integrated into header */}
            {groupBy === 'timeblock' && (
              <Button 
                onClick={() => signoff(tasklist)} 
                disabled={!canSubmit}
                size="sm"
                variant={canSubmit ? "filled" : "outline"}
                color={canSubmit ? "green" : "gray"}
              >
                Sign & Submit
              </Button>
            )}
          </Group>
        </Group>
      </Card.Section>
      
      <Collapse in={isExpanded}>
        <Card.Section inheritPadding py="md">
          <Stack gap="sm">
            {tasks.map((task) => {
              const state = states.find((s) => s.taskId === task.id);
              const isComplete = state?.status === "Complete";
              const canComplete = canTaskBeCompleted(task, state);
              const opened = isTaskOpen(tasklist.id, task.id);
              
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  state={state}
                  isComplete={isComplete}
                  canComplete={canComplete}
                  opened={opened}
                  onToggle={() => onToggleTask(tasklist.id, task.id)}
                  onUpdate={(patch) => updateTaskState(tasklist.id, task.id, patch)}
                  onComplete={() => handleComplete(tasklist, task)}
                  onUpload={(file) => handleUpload(tasklist, task, file)}
                />
              );
            })}
          </Stack>
        </Card.Section>
      </Collapse>
    </Card>
  );
}

function TaskCard({ task, state, isComplete, canComplete, opened, onToggle, onUpdate, onComplete, onUpload }) {
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 1: return 'red';
      case 2: return 'orange';
      case 3: return 'blue';
      case 4: return 'gray';
      default: return 'blue';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return 'Critical';
      case 2: return 'High';
      case 3: return 'Normal';
      case 4: return 'Low';
      default: return 'Normal';
    }
  };

  return (
    <Card
      withBorder
      radius="md"
      style={{
        borderColor: isComplete ? "var(--mantine-color-green-6)" : "var(--mantine-color-gray-4)",
        background: isComplete 
          ? "color-mix(in oklab, var(--mantine-color-green-6) 8%, var(--mantine-color-body))" 
          : "var(--mantine-color-body)",
        transition: 'all 0.2s ease',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ActionIcon 
            variant="subtle" 
            onClick={onToggle} 
            aria-label="Toggle details"
            style={{ flexShrink: 0 }}
          >
            {opened ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
          
          <div style={{ minWidth: 0, flex: 1 }}>
            <Group gap={6} wrap="wrap" align="center">
              <Text fw={600} c={isComplete ? "green.9" : undefined} style={{ wordBreak: 'break-word', lineHeight: 1.3 }}>
                {task.title}
              </Text>
              
              <Badge
                size="xs"
                color={getPriorityColor(task.priority)}
                variant="light"
              >
                {getPriorityLabel(task.priority)}
              </Badge>
              
              {task.category && (
                <Badge size="xs" variant="outline" color="gray">
                  {task.category}
                </Badge>
              )}
              
              {state?.reviewStatus && (
                <Badge
                  variant="outline"
                  color={state.reviewStatus === "Approved" ? "green" : state.reviewStatus === "Rework" ? "yellow" : "gray"}
                  size="xs"
                >
                  {state.reviewStatus}
                </Badge>
              )}
              
              {isComplete && (
                <Badge color="green" variant="light" leftSection={<IconCheck size={12} />} size="xs">
                  Completed
                </Badge>
              )}
            </Group>
            
            <Group gap="xs" mt={4} wrap="wrap">
              <Text c="dimmed" fz="xs">
                {task.inputType}
              </Text>
              {task.photoRequired && (
                <Badge size="xs" variant="dot" color="blue">Photo</Badge>
              )}
              {task.noteRequired && (
                <Badge size="xs" variant="dot" color="orange">Note</Badge>
              )}
              {task.inputType === "number" && task.min !== null && task.max !== null && (
                <Badge size="xs" variant="dot" color="purple">
                  {task.min}-{task.max}
                </Badge>
              )}
            </Group>
          </div>
        </Group>

        <Group gap="xs" wrap="wrap" justify="flex-end" style={{ flexShrink: 0 }} visibleFrom="sm">
          {task.inputType === "number" && (
            <NumberInput
              placeholder={`${task.min ?? ""}-${task.max ?? ""}`}
              value={state?.value ?? ""}
              onChange={(v) => onUpdate({ value: Number(v) })}
              disabled={isComplete}
              style={{ width: rem(96) }}
              size="sm"
            />
          )}

          <TextInput
            placeholder="Add note"
            value={state?.note ?? ""}
            onChange={(e) => onUpdate({ note: e.target.value })}
            disabled={isComplete && !task.noteRequired}
            style={{ width: rem(180) }}
            size="sm"
          />

          <FileButton onChange={(file) => file && onUpload(file)} accept="image/*" disabled={isComplete}>
            {(props) => (
              <Button variant="default" leftSection={<IconUpload size={14} />} size="sm" {...props}>
                Photo
              </Button>
            )}
          </FileButton>

          <Button
            variant={isComplete ? "outline" : "default"}
            color={isComplete ? "green" : undefined}
            onClick={onComplete}
            disabled={!canComplete || isComplete}
            size="sm"
          >
            {isComplete ? "✓ Done" : "Complete"}
          </Button>

          <Switch
            checked={!!state?.na}
            onChange={(e) => onUpdate({ na: e.currentTarget.checked })}
            disabled={isComplete}
            label="N/A"
            size="sm"
          />
        </Group>
      </Group>

      <Collapse in={opened}>
        <Divider my="sm" />
        <Stack gap="xs">
          <TextInput
            placeholder="Add note"
            value={state?.note ?? ""}
            onChange={(e) => onUpdate({ note: e.target.value })}
            disabled={isComplete && !task.noteRequired}
            style={{ width: "100%" }}
            hiddenFrom="sm"
            size="sm"
          />
          
          <Stack gap="xs" hiddenFrom="sm">
            {task.inputType === "number" && (
              <NumberInput
                placeholder={`${task.min ?? ""}-${task.max ?? ""}`}
                value={state?.value ?? ""}
                onChange={(v) => onUpdate({ value: Number(v) })}
                disabled={isComplete}
                size="sm"
              />
            )}
            <FileButton onChange={(file) => file && onUpload(file)} accept="image/*" disabled={isComplete}>
              {(props) => (
                <Button variant="default" leftSection={<IconUpload size={14} />} fullWidth size="sm" {...props}>
                  Upload Photo
                </Button>
              )}
            </FileButton>
            <Button
              variant={isComplete ? "outline" : "default"}
              color={isComplete ? "green" : undefined}
              onClick={onComplete}
              disabled={!canComplete || isComplete}
              fullWidth
              size="sm"
            >
              {isComplete ? "Completed ✓" : "Complete Task"}
            </Button>
            <Switch
              checked={!!state?.na}
              onChange={(e) => onUpdate({ na: e.currentTarget.checked })}
              disabled={isComplete}
              label="N/A"
              size="sm"
            />
          </Stack>
          <EvidenceRow state={state} />
        </Stack>
      </Collapse>
    </Card>
  );
}

/** ---------------------- Employee View ---------------------- */
function EmployeeView({
  tasklists,
  working,
  updateTaskState,
  handleComplete,
  handleUpload,
  signoff,
  submissions,
  setSubmissions,
  setWorking,
  checklists,
  company,
  tab,
  onRestockOpenCountChange,
  employees,
  currentEmployee
}) {
  const [openLists, setOpenLists] = React.useState({});
  const [openTasks, setOpenTasks] = React.useState({});
  const [groupBy, setGroupBy] = React.useState('timeblock'); // 'timeblock', 'category', 'priority', 'status'
  const [sortBy, setSortBy] = React.useState('priority'); // 'priority', 'alphabetical', 'completion'

  const [restockList, setRestockList] = React.useState([]);
  const [loadingRestock, setLoadingRestock] = React.useState(false);
  const restockLocationId = tasklists[0]?.locationId || null;

  const applyRestockRows = React.useCallback((rows) => {
    const list = Array.isArray(rows) ? rows : [];
    setRestockList(list);
    const count = list.filter(r => String(r.status).toLowerCase() !== 'completed').length;
    onRestockOpenCountChange?.(count);
  }, [onRestockOpenCountChange]);

  // Load restock data on app start and when dependencies change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company?.id) return;
      try {
        setLoadingRestock(true);
        const rows = await listRestockRequests(company.id, { locationId: restockLocationId, status: null });
        if (!cancelled) {
          applyRestockRows(rows);
        }
      } finally {
        if (!cancelled) setLoadingRestock(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id, restockLocationId, applyRestockRows]);

  // Debounced restock refresh to prevent rapid-fire updates
  const debouncedRefreshRestock = useCallback(
    debounce(async () => {
      if (!company?.id) return;
      try {
        const rows = await listRestockRequests(company.id, { locationId: restockLocationId, status: null });
        applyRestockRows(rows);
      } catch (e) {
        console.error('Failed to refresh restock list:', e);
      }
    }, 300),
    [company?.id, restockLocationId, applyRestockRows]
  );

  const handleRestockSubmitted = useCallback(() => {
    debouncedRefreshRestock();
  }, [debouncedRefreshRestock]);

  const openRestockRequests = React.useMemo(
    () => restockList.filter((r) => String(r.status).toLowerCase() !== "completed"),
    [restockList]
  );

  const completedRestockRequests = React.useMemo(
    () => restockList.filter((r) => String(r.status).toLowerCase() === "completed"),
    [restockList]
  );

  const getRestockDisplay = (request) => {
    // Handle joined item from Supabase (when item_id is set)
    // Supabase returns it as an object with the item fields
    let linkedItem = null;
    if (request.item && typeof request.item === "object" && !Array.isArray(request.item) && request.item.id) {
      // Valid joined item object
      linkedItem = request.item;
    } else if (Array.isArray(request.item) && request.item.length > 0 && request.item[0]?.id) {
      // Sometimes Supabase wraps single relations in arrays
      linkedItem = request.item[0];
    }
    
    // Extract name: prefer linked item name, fallback to legacy text field, then default
    const name =
      (linkedItem?.name && linkedItem.name.trim()) ||
      (typeof request.item === "string" && request.item.trim()) ||
      "Item";
    
    const categoryLabel = linkedItem?.category || request.category || "Other";
    const image = linkedItem?.image_url || null;
    const unitSku =
      linkedItem && (linkedItem.unit || linkedItem.sku)
        ? [linkedItem.unit, linkedItem.sku].filter(Boolean).join(" · ")
        : null;
    return { linkedItem, name, categoryLabel, image, unitSku };
  };

  // Set up real-time subscription for restock requests
  useEffect(() => {
    if (!company?.id) return;
    
    const channel = supabase
      .channel(`restock-sync:${company.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restock_request',
        filter: `company_id=eq.${company.id}`
      }, debouncedRefreshRestock)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company?.id, debouncedRefreshRestock]);

  const isTaskOpen = (tlId, taskId) => !!openTasks[`${tlId}:${taskId}`];
  const toggleTaskOpen = (tlId, taskId) =>
    setOpenTasks((prev) => {
      const k = `${tlId}:${taskId}`;
      return { ...prev, [k]: !prev[k] };
    });

  // Group and sort tasks based on selected options
  const groupedTasklists = React.useMemo(() => {
    if (tasklists.length === 0) return [];

    const allTasks = tasklists.flatMap(tl => 
      tl.tasks.map(task => ({
        ...task,
        tasklistId: tl.id,
        tasklist: tl,
        states: working?.[tl.id] ?? []
      }))
    );

    // Sort tasks
    const sortedTasks = [...allTasks].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return (a.priority || 3) - (b.priority || 3);
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        case 'completion':
          const aState = a.states.find(s => s.taskId === a.id);
          const bState = b.states.find(s => s.taskId === b.id);
          const aComplete = aState?.status === "Complete" || aState?.na;
          const bComplete = bState?.status === "Complete" || bState?.na;
          return aComplete === bComplete ? 0 : aComplete ? 1 : -1;
        default:
          return 0;
      }
    });

    // Group tasks
    const groups = new Map();
    
    sortedTasks.forEach(task => {
      let groupKey;
      let groupTitle;
      
      switch (groupBy) {
        case 'timeblock':
          groupKey = task.tasklist.timeBlockId || 'no-timeblock';
          groupTitle = getTimeBlockLabelFromLists(checklists.timeBlocks, task.tasklist.timeBlockId) || 'No Time Block';
          break;
        case 'category':
          groupKey = task.category || 'uncategorized';
          groupTitle = task.category || 'Uncategorized';
          break;
        case 'priority':
          groupKey = task.priority || 3;
          const priorityLabels = { 1: 'Critical', 2: 'High', 3: 'Normal', 4: 'Low' };
          groupTitle = `${priorityLabels[task.priority || 3]} Priority`;
          break;
        case 'status':
          const state = task.states.find(s => s.taskId === task.id);
          const isComplete = state?.status === "Complete" || state?.na;
          groupKey = isComplete ? 'completed' : 'pending';
          groupTitle = isComplete ? 'Completed Tasks' : 'Pending Tasks';
          break;
        default:
          groupKey = 'default';
          groupTitle = 'All Tasks';
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          title: groupTitle,
          tasks: [],
          tasklist: task.tasklist
        });
      }
      groups.get(groupKey).tasks.push(task);
    });

    return Array.from(groups.values());
  }, [tasklists, working, groupBy, sortBy, checklists.timeBlocks]);

  // Calculate overall progress
  const overallProgress = React.useMemo(() => {
    if (tasklists.length === 0) return { completed: 0, total: 0, percentage: 0 };
    
    const allTasks = tasklists.flatMap(tl => tl.tasks);
    const allStates = tasklists.flatMap(tl => working?.[tl.id] ?? []);
    
    const completed = allTasks.filter(task => {
      const state = allStates.find(s => s.taskId === task.id);
      return state?.status === "Complete" || state?.na;
    }).length;
    
    const total = allTasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  }, [tasklists, working]);

  // Theme detection
  const { colorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  const isDark = computed === 'dark';

  return (
    <Stack gap="md">
      {/* Progress Summary Dashboard */}
      {tab === 'tasks' && tasklists.length > 0 && (
        <Card withBorder radius="lg" shadow="sm" style={{ 
          background: overallProgress.percentage === 100 
            ? (isDark 
                ? 'linear-gradient(135deg, var(--mantine-color-green-9) 0%, var(--mantine-color-green-8) 100%)'
                : 'linear-gradient(135deg, var(--mantine-color-green-0) 0%, var(--mantine-color-green-1) 100%)')
            : (isDark 
                ? 'linear-gradient(135deg, var(--mantine-color-blue-9) 0%, var(--mantine-color-blue-8) 100%)'
                : 'linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-blue-1) 100%)'),
          borderColor: overallProgress.percentage === 100 
            ? 'var(--mantine-color-green-6)' 
            : 'var(--mantine-color-blue-6)'
        }}>
          <Group justify="space-between" align="center" p="md">
            <div>
              <Text fw={700} fz="xl" c={overallProgress.percentage === 100 ? (isDark ? "green.1" : "green.8") : (isDark ? "blue.1" : "blue.8")}>
                Today's Progress
              </Text>
              <Text c={isDark ? "gray.3" : "dimmed"} size="sm" mt={4}>
                {overallProgress.completed} of {overallProgress.total} tasks completed
              </Text>
            </div>
            
            <Group gap="lg" align="center">
              <div style={{ textAlign: 'center' }}>
                <Text fw={600} size="lg" c={overallProgress.percentage === 100 ? (isDark ? "green.1" : "green.8") : (isDark ? "blue.1" : "blue.8")}>
                  {overallProgress.percentage}%
                </Text>
                <Text size="xs" c={isDark ? "gray.3" : "dimmed"}>Complete</Text>
              </div>
              
              <div style={{ 
                width: 80, 
                height: 80, 
                borderRadius: '50%', 
                background: `conic-gradient(${overallProgress.percentage === 100 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-blue-6)'} ${overallProgress.percentage * 3.6}deg, var(--mantine-color-gray-3) 0deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <div style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'var(--mantine-color-body)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Text size="sm" fw={700} c={overallProgress.percentage === 100 ? (isDark ? "green.1" : "green.8") : (isDark ? "blue.1" : "blue.8")}>
                    {overallProgress.percentage}
                  </Text>
                </div>
              </div>
            </Group>
          </Group>
        </Card>
      )}


      {tab === 'tasks' && (tasklists.length === 0 ? (
        // Skeleton loading for tasklists
        <Stack gap="md">
          {[1, 2, 3].map((i) => (
            <Card key={i} withBorder radius="lg" shadow="sm">
              <Group justify="space-between" align="center">
                <div>
                  <Skeleton height={20} width={200} mb="xs" />
                  <Skeleton height={16} width={150} mb="xs" />
                  <Skeleton height={16} width={100} />
                </div>
                <Skeleton height={36} width={120} />
              </Group>
              <Stack gap="xs" mt="md">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} height={60} radius="md" />
                ))}
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : (
        <Stack gap="md">
          {groupedTasklists.map((group) => {
            const states = group.tasks.map(task => {
              const state = task.states.find(s => s.taskId === task.id);
              return state || {
                taskId: task.id,
                status: "Incomplete",
                value: null,
                note: "",
                photos: [],
                na: false,
                reviewStatus: "Pending",
              };
            });
            
            const canSubmit = group.tasks.every((task) => {
              const state = states.find((s) => s.taskId === task.id);
              return (state.status === "Complete" || state.na) && canTaskBeCompleted(task, state);
            });

            return (
              <TaskGroup
                key={group.key}
                title={group.title}
                tasks={group.tasks}
                tasklist={group.tasklist}
                states={states}
                onToggleTask={toggleTaskOpen}
                isTaskOpen={isTaskOpen}
                updateTaskState={updateTaskState}
                handleComplete={handleComplete}
                handleUpload={handleUpload}
                getTimeBlockLabel={(timeBlockId) => getTimeBlockLabelFromLists(checklists.timeBlocks, timeBlockId)}
                signoff={signoff}
                groupBy={groupBy}
              />
            );
          })}
          
          {/* Overall Sign & Submit for non-timeblock groupings */}
          {groupBy !== 'timeblock' && tasklists.length > 0 && (
            <Card withBorder radius="lg" shadow="sm" style={{ 
              background: isDark ? 'var(--mantine-color-blue-9)' : 'var(--mantine-color-blue-0)',
              borderColor: 'var(--mantine-color-blue-6)'
            }}>
              <Group justify="space-between" align="center" p="md">
                <div>
                  <Text fw={600} size="md" c={isDark ? "blue.1" : "blue.8"}>Complete All Tasks</Text>
                  <Text c={isDark ? "gray.3" : "dimmed"} size="sm">
                    Sign and submit all completed tasklists for review
                  </Text>
                </div>
                <Group gap="sm">
                  {tasklists.map((tl) => {
                    const states = working?.[tl.id] ?? [];
                    const canSubmit = tl.tasks.every((t) => {
                      const st = states.find((s) => s.taskId === t.id);
                      return (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
                    });
                    
                    return (
                      <Button
                        key={tl.id}
                        onClick={() => signoff(tl)}
                        disabled={!canSubmit}
                        size="sm"
                        variant={canSubmit ? "filled" : "outline"}
                        color={canSubmit ? "green" : "gray"}
                      >
                        {tl.name}
                      </Button>
                    );
                  })}
                </Group>
              </Group>
            </Card>
          )}
        </Stack>
      ))}

      {tab === 'restock' && (
        <Stack gap="md">
          <RestockRequestForm
            companyId={company?.id}
            locationId={restockLocationId}
            currentEmployeeId={currentEmployee}
            onSubmitted={handleRestockSubmitted}
          />

          <Card withBorder radius="lg" shadow="sm">
            <Text fw={600} mb="xs">Open requests</Text>
            {loadingRestock ? (
              <Stack gap="sm">
                <Skeleton height={40} width="100%" />
                <Skeleton height={80} width="100%" />
                <Skeleton height={80} width="100%" />
              </Stack>
            ) : (
              <Stack gap="xs">
                {openRestockRequests.map((r) => {
                  const display = getRestockDisplay(r);
                  return (
                    <Card key={r.id} withBorder radius="md">
                      <Group justify="space-between" align="flex-start" wrap="wrap">
                        <Group gap="sm" align="flex-start">
                          <Avatar
                            src={display.image || undefined}
                            radius="md"
                            size={48}
                          >
                            {display.name?.[0] ?? "?"}
                          </Avatar>
                          <div>
                            <Text fw={600}>{display.name}</Text>
                            <Text c="dimmed" size="sm">{display.categoryLabel}</Text>
                            {display.unitSku && (
                              <Text c="dimmed" size="xs">{display.unitSku}</Text>
                            )}
                            <Text c="dimmed" size="sm">
                              Qty: {r.quantity} • Urgency: {r.urgency}
                            </Text>
                            {r.notes && <Text c="dimmed" size="sm">{r.notes}</Text>}
                          </div>
                        </Group>
                        <Stack gap="xs" style={{ minWidth: 220, flex: "0 0 220px" }}>
                          <Select
                            placeholder="Fulfilled by"
                            value={r.fulfilled_by || ''}
                            onChange={(v) => setRestockList(prev => prev.map(x => x.id === r.id ? { ...x, fulfilled_by: v || null } : x))}
                            data={(employees || []).map(u => ({ value: String(u.id), label: u.display_name }))}
                            searchable
                            comboboxProps={{ withinPortal: true }}
                          />
                          <Button variant="default" onClick={async () => {
                            try {
                              const updated = await completeRestockRequest({ id: r.id, fulfilled_by: r.fulfilled_by || null });
                              setRestockList(prev => prev.map(x => x.id === r.id ? updated : x));
                              const newCount = Math.max(0, openRestockRequests.filter((x) => x.id !== r.id).length);
                              onRestockOpenCountChange?.(newCount);
                            } catch (e) {
                              console.error(e);
                              alert('Failed to complete');
                            }
                          }}>
                            Mark Completed
                          </Button>
                        </Stack>
                      </Group>
                    </Card>
                  );
                })}
                {openRestockRequests.length === 0 && (
                  <Text c="dimmed">No open requests.</Text>
                )}
              </Stack>
            )}

            <Divider my="sm" />
            <Text fw={600} mb="xs">Completed</Text>
            <Stack gap="xs">
              {completedRestockRequests.map((r) => {
                const display = getRestockDisplay(r);
                return (
                  <Card key={r.id} withBorder radius="md">
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                      <Group gap="sm" align="flex-start">
                        <Avatar
                          src={display.image || undefined}
                          radius="md"
                          size={48}
                        >
                          {display.name?.[0] ?? "?"}
                        </Avatar>
                        <div>
                          <Text fw={600}>{display.name}</Text>
                          <Text c="dimmed" size="sm">{display.categoryLabel}</Text>
                          {display.unitSku && (
                            <Text c="dimmed" size="xs">{display.unitSku}</Text>
                          )}
                          <Text c="dimmed" size="sm">
                            Qty: {r.quantity} • Urgency: {r.urgency}
                          </Text>
                          {r.notes && <Text c="dimmed" size="sm">{r.notes}</Text>}
                        </div>
                      </Group>
                      <Text c="dimmed" size="sm">
                        Fulfilled by: {(employees || []).find(u => String(u.id) === String(r.fulfilled_by))?.display_name || r.fulfilled_by || '—'}
                      </Text>
                    </Group>
                  </Card>
                );
              })}
              {completedRestockRequests.length === 0 && (
                <Text c="dimmed">No completed requests yet.</Text>
              )}
            </Stack>
          </Card>
        </Stack>
      )}

      <Card withBorder radius="md" style={{ position: "sticky", zIndex: 1, top: 90 }}>
        <Text fw={600} fz="lg" mb="xs">Review Queue (Rework Needed)</Text>
        {submissions.filter((s) => s.status === "Rework").length === 0 ? (
          <Text c="dimmed" fz="sm">No rework requested.</Text>
        ) : (
          submissions
            .filter((s) => s.status === "Rework")
            .map((s) => (
              <EmployeeReworkCard
                key={s.id}
                s={s}
                setSubmissions={setSubmissions}
                setWorking={setWorking}
                getTaskMeta={(tasklistId, taskId) => {
                  const tl = tasklists.find((x) => x.id === tasklistId);
                  return tl?.tasks.find((t) => t.id === taskId) || { title: taskId, inputType: "checkbox" };
                }}
                company={company}
              />
            ))
        )}
      </Card>
    </Stack>
  );
}

function resolveTasklistsForDayFromLists({ timeBlocks, templates }, locationId, dateISO, tz = "UTC") {
  const dow = weekdayIndexFromISO(dateISO, tz);
  const tMap = Object.fromEntries((timeBlocks || []).map(tb => [tb.id, tb]));
  const todays = (templates || []).filter(t =>
    (t.active !== false) &&
    t.locationId === locationId &&
    Array.isArray(t.recurrence) &&
    t.recurrence.includes(dow)
  );
  const list = todays.map(tpl => ({
    id: tpl.id,
    locationId: tpl.locationId,
    name: tpl.name,
    timeBlockId: tpl.timeBlockId,
    recurrence: tpl.recurrence || [],
    requiresApproval: tpl.requiresApproval !== false,
    signoffMethod: tpl.signoffMethod || "PIN",
    tasks: (tpl.tasks || []).map(t => ({
      id: t.id, title: t.title, category: t.category || "",
      inputType: t.inputType || "checkbox",
      min: t.min ?? null, max: t.max ?? null,
      photoRequired: !!t.photoRequired,
      noteRequired: !!t.noteRequired,
      allowNA: t.allowNA !== false,
      priority: typeof t.priority === "number" ? t.priority : 3
    }))
  }));
  list.sort((a, b) => (tMap[a.timeBlockId]?.start || "00:00").localeCompare(tMap[b.timeBlockId]?.start || "00:00"));
  return list;
}



function EmployeeReworkCard({ s, setSubmissions, setWorking, getTaskMeta, company }) {
  function updateSubmissionTask(submissionId, taskId, patch) {
    setSubmissions((prev) =>
      prev.map((sx) => {
        if (sx.id !== submissionId) return sx;
        const tasks = sx.tasks.map((t) => {
          if (t.taskId !== taskId) return t;
          const p = typeof patch === "function" ? patch(t) : patch;
          return { ...t, ...p };
        });
        return { ...sx, tasks };
      })
    );
  }
  function batchUpdateSubmissionTasks(submissionId, decidePatch) {
    setSubmissions((prev) =>
      prev.map((sx) => {
        if (sx.id !== submissionId) return sx;
        const tasks = sx.tasks.map((t) => {
          const meta = getTaskMeta(sx.tasklistId, t.taskId);
          const p = decidePatch(t, meta);
          return p ? { ...t, ...p } : t;
        });
        return { ...sx, tasks };
      })
    );
  }

  function recomputeSubmissionStatus(submissionId) {
    setSubmissions((prev) =>
      prev.map((sx) => {
        if (sx.id !== submissionId) return sx;
        const statuses = sx.tasks.map((t) => t.reviewStatus);
        const hasRework = statuses.includes("Rework");
        const allApproved = sx.tasks.length > 0 && sx.tasks.every((t) => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : allApproved ? "Approved" : "Pending";
        return { ...sx, status };
      })
    );
  }

  return (
    <Card withBorder radius="md" mt="sm">
      <Group justify="space-between">
        <div>
          <Text fw={600}>{s.tasklistName}</Text>
          <Text c="dimmed" fz="sm">{s.date} • Signed: {s.signedBy}</Text>
        </div>
        <Badge color="yellow" variant="light">Rework</Badge>
      </Group>

      <ScrollArea mt="sm">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Task</Table.Th>
              <Table.Th>Value / Note</Table.Th>
              <Table.Th className="hide-sm">Photos</Table.Th>
              <Table.Th>Fix</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {s.tasks.filter((t) => t.reviewStatus === "Rework").map((t, i) => {
              const meta = getTaskMeta(s.tasklistId, t.taskId);
              const isComplete = t.status === "Complete";
              const canComplete = canTaskBeCompleted(meta, t);
              return (
                <Table.Tr key={i}>
                  <Table.Td><Text fw={600}>{meta.title}</Text></Table.Td>
                  <Table.Td>
                    <Group wrap="wrap" gap="xs">
                      {meta.inputType === "number" && (
                        <NumberInput
                          placeholder={`${meta.min ?? ""}-${meta.max ?? ""}`}
                          value={t.value ?? ""}
                          onChange={(v) => updateSubmissionTask(s.id, t.taskId, { value: Number(v) })}
                          style={{ width: rem(110) }}
                        />
                      )}
                      <TextInput
                        placeholder="Add note"
                        value={t.note ?? ""}
                        onChange={(e) => updateSubmissionTask(s.id, t.taskId, { note: e.target.value })}
                        style={{ minWidth: rem(160) }}
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td className="hide-sm">
                    <Group gap="xs" wrap="wrap">
                      <FileButton
                        onChange={async (file) => {
                          if (!file) return;
                          try {
                            const path = await uploadEvidence({
                              supabase,
                              bucket: 'evidence',
                              companyId: s.companyId ?? company.id,     // ensure you pass company.id somehow
                              tasklistId: s.tasklistId,
                              taskId: t.taskId,
                              file
                            });
                            // persist to DB (merge existing row safely)
                            const { data: row } = await supabase
                              .from('submission_task')
                              .select('status, review_status, na, value, note, photos')
                              .eq('submission_id', s.id)
                              .eq('task_id', t.taskId)
                              .maybeSingle();
                            await upsertSubmissionTask({
                              supabase,
                              submissionId: s.id,
                              taskId: t.taskId,
                              payload: {
                                status: row?.status ?? 'Incomplete',
                                review_status: row?.review_status ?? 'Pending',
                                na: !!row?.na,
                                value: row?.value ?? null,
                                note: row?.note ?? null,
                                photos: [...(row?.photos || []), path],
                              },
                            });
                            // local mirror
                            updateSubmissionTask(s.id, t.taskId, (prev) => ({ photos: [...(prev.photos || []), path] }));
                          } catch (e) {
                            console.error(e);
                            alert('Upload failed');
                          }
                        }}
                        accept="image/*"
                      >
                        {(props) => <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>Upload</Button>}
                      </FileButton>
                      <Group gap="xs">
                        {(t.photos || []).map((p, j) => (
                          <Badge key={j} variant="light" leftSection={<IconPhoto size={14} />}>{p}</Badge>
                        ))}
                      </Group>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      variant={isComplete ? "outline" : "default"}
                      color={isComplete ? "green" : undefined}
                      disabled={isComplete || !canComplete}
                      onClick={() => updateSubmissionTask(s.id, t.taskId, { status: "Complete" })}
                    >
                      {isComplete ? "Completed ✓" : "Mark Complete"}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Group justify="flex-end" mt="sm">
        <Button
          onClick={() => {
            batchUpdateSubmissionTasks(s.id, (task, meta) => {
              if (task.reviewStatus === "Rework" && task.status === "Complete" && canTaskBeCompleted(meta, task)) {
                return { reviewStatus: "Pending" };
              }
              return null;
            });
            recomputeSubmissionStatus(s.id);
            alert("Resubmitted fixes for review.");
          }}
        >
          Resubmit for Review
        </Button>
      </Group>
    </Card>
  );
}

/** ---------------------- Manager View ---------------------- */
function ManagerView({
  submissions,
  setSubmissions,
  setWorking,
  company,
  locations,
  employees,
  getTaskMeta,
  checklists
}) {
  async function fetchManagerSubmissions({ supabase, companyId, from, to, locationId }) {
    let q = supabase
      .from('submission')
      .select(`
        id, tasklist_id, location_id, date, status, signed_by, submitted_by,
         submission_task:submission_task (
   task_id, status, review_status, na, value, note, photos, rework_count, review_note, submitted_by
 )
      `)
      .eq('company_id', companyId)
      .gte('date', from)
      .lte('date', to);

    if (locationId) q = q.eq('location_id', locationId);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  const [reworkNote, setReworkNote] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  
  // Theme detection
  const { colorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  const isDark = computed === 'dark';

  const userById = useMemo(() => {
    const m = new Map();
    (employees || []).forEach(u => m.set(String(u.id), u));
    return m;
  }, [employees]);

  const nameForUserId = (uid) => {
    const u = uid ? userById.get(String(uid)) : null;
    return u?.display_name || uid || "—";
  };


  // ---------- Filters ----------
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    locationId: "",
    employee: "",
    category: "",
    status: "", // Pending | Approved | Rework
    priority: "", // High | Normal | Low
    hasPhotos: "", // true | false | ""
    hasNotes: "", // true | false | ""
    reworkCount: "", // 0 | 1+ | ""
  });

  const locationOptions = [{ value: "", label: "All locations" }].concat(
    locations.map((l) => ({ value: String(l.id), label: l.name }))
  );
  const employeeOptions = [{ value: "", label: "All employees" }].concat(
    (employees || []).map(u => ({ value: String(u.id), label: u.display_name }))
  );
  const categoryOptions = [{ value: "", label: "All categories" }].concat(
    Array.from(
      new Set(
        submissions.flatMap((s) =>
          s.tasks.map((t) => (getTaskMeta(s.tasklistId, t.taskId)?.category || "").trim())
        )
      )
    )
      .filter(Boolean)
      .map((c) => ({ value: c, label: c }))
  );

  function matchesFilters(s) {
    if (filters.locationId && s.locationId !== filters.locationId) return false;
    if (filters.employee) {
      const submissionSubmitterOk = String(s.submittedBy || "") === String(filters.employee);
      const anyTaskSubmitterOk = s.tasks?.some(t => String(t.submittedBy || "") === String(filters.employee));
      if (!submissionSubmitterOk && !anyTaskSubmitterOk) return false;
    }
    if (filters.status && s.status !== filters.status) return false;
    if (filters.from && s.date < filters.from) return false;
    if (filters.to && s.date > filters.to) return false;
    if (filters.category) {
      const any = s.tasks.some(
        (t) => (getTaskMeta(s.tasklistId, t.taskId)?.category || "").trim() === filters.category
      );
      if (!any) return false;
    }
    if (filters.priority) {
      const any = s.tasks.some(
        (t) => {
          const meta = getTaskMeta(s.tasklistId, t.taskId);
          const priority = meta?.priority || 3;
          const priorityLabel = priority === 1 ? "Critical" : priority === 2 ? "High" : priority === 3 ? "Normal" : "Low";
          return priorityLabel === filters.priority;
        }
      );
      if (!any) return false;
    }
    if (filters.hasPhotos !== "") {
      const hasPhotos = filters.hasPhotos === "true";
      const any = s.tasks.some(t => {
        const hasTaskPhotos = Array.isArray(t.photos) && t.photos.length > 0;
        return hasTaskPhotos === hasPhotos;
      });
      if (!any) return false;
    }
    if (filters.hasNotes !== "") {
      const hasNotes = filters.hasNotes === "true";
      const any = s.tasks.some(t => {
        const hasTaskNotes = t.note && t.note.trim() !== "";
        return hasTaskNotes === hasNotes;
      });
      if (!any) return false;
    }
    if (filters.reworkCount !== "") {
      const any = s.tasks.some(t => {
        const reworkCount = t.reworkCount || 0;
        if (filters.reworkCount === "0") return reworkCount === 0;
        if (filters.reworkCount === "1+") return reworkCount >= 1;
        return false;
      });
      if (!any) return false;
    }
    return true;
  }

  const filtered = submissions.filter(matchesFilters);

  // ---------- Metrics ----------
  const totals = filtered.reduce(
    (acc, s) => {
      for (const t of s.tasks) {
        const approved = t.reviewStatus === "Approved";
        const isNA = !!t.na;

        // Count a task as complete ONLY once when finally approved (or N/A)
        if (approved || isNA) acc.totalTasksCompleted += 1;

        // Current rework queue count = tasks currently marked Rework
        if (t.reviewStatus === "Rework") acc.totalRework += 1;

        // Tasks that went through rework at any point (for reporting)
        if (t.wasReworked) acc.totalReworkedHistorical += 1;
      }
      return acc;
    },
    { totalTasksCompleted: 0, totalRework: 0, totalReworkedHistorical: 0 }
  );


  const byEmployeeMap = new Map();
  for (const s of filtered) {
    const empId = s.submittedBy || s.signedBy || "Unknown";
    const empName = nameForUserId(empId);
    if (!byEmployeeMap.has(empId)) byEmployeeMap.set(empId, { employee: empName, completed: 0 });
    const row = byEmployeeMap.get(empId);
    for (const t of s.tasks) {
      if (t.na || t.reviewStatus === "Approved") row.completed += 1;
      if (t.wasReworked) row.reworked += 1; // optional, if you want to visualize it later
    }
  }
  const byEmployee = Array.from(byEmployeeMap.values()).sort(
    (a, b) => b.completed - a.completed
  );

  // ---------- Approvals (existing behavior) ----------
  const [selection, setSelection] = useState({});
  function toggle(subId, taskId) {
    setSelection((prev) => {
      const cur = new Set(prev[subId] || []);
      cur.has(taskId) ? cur.delete(taskId) : cur.add(taskId);
      return { ...prev, [subId]: cur };
    });
  }

  async function markTasksRework({ supabase, submissionId, taskIds, note }) {
    const { error } = await supabase.rpc('mark_rework', {
      p_submission_id: submissionId,
      p_task_ids: taskIds,
      p_note: note ?? null
    });
    if (error) throw error;
  }

  async function markTasksApproved({ supabase, submissionId, taskIds }) {
    const { error } = await supabase
      .from('submission_task')
      .update({ review_status: 'Approved' })
      .eq('submission_id', submissionId)
      .in('task_id', taskIds);
    if (error) throw error;
  }

  async function applyReview(subId, review, note) {
    // 1) Resolve which tasks are selected (default to all tasks in the submission)
    const sel = selection[subId];
    const sub = submissions.find(x => x.id === subId);
    if (!sub) return;

    const taskIds = (sel && sel.size > 0)
      ? Array.from(sel)
      : sub.tasks.map(t => t.taskId);

    if (!taskIds.length) return;

    try {
      // 2) Persist to DB first
      if (review === 'Rework') {
        await markTasksRework({ supabase, submissionId: subId, taskIds, note });
      } else if (review === 'Approved') {
        await markTasksApproved({ supabase, submissionId: subId, taskIds });
      } else {
        throw new Error('Unsupported review value');
      }

      // 3) Local mirror (keeps UI snappy)
      setSubmissions(prev =>
        prev.map(s => {
          if (s.id !== subId) return s;

          const tasks = s.tasks.map(t => {
            if (!taskIds.includes(t.taskId)) return t;

            if (review === 'Rework') {
              return {
                ...t,
                reviewStatus: 'Rework',
                reviewNote: note || t.reviewNote || '',
                reworkCount: (t.reworkCount ?? 0) + 1,
                wasReworked: true,
              };
            }
            // Approved
            return { ...t, reviewStatus: 'Approved' };
          });

          // Recompute submission aggregate status
          const hasRework = tasks.some(t => t.reviewStatus === 'Rework');
          const allApproved = tasks.length > 0 && tasks.every(t => t.reviewStatus === 'Approved');
          const status = hasRework ? 'Rework' : (allApproved ? 'Approved' : 'Pending');

          // Reflect to employee working state so they see up-to-date review chips
          setWorking(prevW => {
            const list = prevW[s.tasklistId];
            if (!list) return prevW;

            const nextList = list.map(wt => {
              if (!taskIds.includes(wt.taskId)) return wt;
              if (review === 'Approved') return { ...wt, status: 'Complete', reviewStatus: 'Approved' };
              if (review === 'Rework') return { ...wt, status: 'Incomplete', reviewStatus: 'Rework' };
              return { ...wt, reviewStatus: review };
            });

            return { ...prevW, [s.tasklistId]: nextList };
          });

          return { ...s, tasks, status };
        })
      );

      // 4) Clear selection for this submission card
      setSelection(prev => ({ ...prev, [subId]: new Set() }));

      // 5) (Optional) Re-fetch from DB if you prefer authoritative state
      const fresh = await fetchManagerSubmissions({
        supabase,
        companyId: company.id,
        from: filters.from || todayISOInTz(company.timezone || 'UTC'),
        to: filters.to || todayISOInTz(company.timezone || 'UTC'),
        locationId: filters.locationId || null
      });
      // setSubmissions(fresh.map(/* map to view model */));
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to update review status');
    }
  }

  useEffect(() => {
    if (!company?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const list = await fetchManagerSubmissions({
          supabase,
          companyId: company.id,
          from: filters.from || todayISOInTz(company.timezone || 'UTC'),
          to: filters.to || todayISOInTz(company.timezone || 'UTC'),
          locationId: filters.locationId || null
        });
        if (!cancelled) setSubmissions(list.map(s => ({
          id: s.id,
          tasklistId: s.tasklist_id,
          locationId: s.location_id,
          date: s.date,
          status: s.status,
          signedBy: s.signed_by,
          submittedBy: s.submitted_by,
          tasks: (s.submission_task || []).map(t => ({
            taskId: t.task_id,
            status: t.status,
            reviewStatus: t.review_status,
            na: t.na,
            value: t.value,
            note: t.note,
            photos: t.photos || [],
            reworkCount: t.rework_count,
            reviewNote: t.review_note,
            submittedBy: t.submitted_by,
          })),
        })));
      } catch (e) {
        console.error(e);
        // show a toast if you want
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, company.id, company.timezone, filters.from, filters.to, filters.locationId]);

  return (
    <Stack gap="md">
      <Tabs defaultValue="approve" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab 
            value="approve" 
            leftSection={<IconShieldHalf size={14} />}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            Approve
          </Tabs.Tab>
          <Tabs.Tab 
            value="dashboard" 
            leftSection={<IconLayoutGrid size={14} />}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            Dashboard
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="approve" pt="md">
          {/* Collapsible Filter Bar */}
          <Card withBorder radius="md" mb="sm" style={{ 
            background: isDark ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-0)',
            borderColor: isDark ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
          }}>
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between" align="center">
                <Group gap="sm" align="center">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    aria-label="Toggle filters"
                  >
                    {filtersExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  </ActionIcon>
                  <div>
                    <Text fw={600} size="md" c={isDark ? "white" : "dark"}>Filters</Text>
                    <Text c={isDark ? "gray.3" : "dimmed"} size="sm">
                      {filtered.length} of {submissions.length} submissions
                    </Text>
                  </div>
                </Group>
                
                <Group gap="sm">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => setFilters({
                      from: "",
                      to: "",
                      locationId: "",
                      employee: "",
                      category: "",
                      status: "",
                      priority: "",
                      hasPhotos: "",
                      hasNotes: "",
                      reworkCount: ""
                    })}
                  >
                    Clear All
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      setFilters({ ...filters, from: weekAgo, to: today });
                    }}
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      setFilters({ ...filters, from: monthAgo, to: today });
                    }}
                  >
                    Last 30 Days
                  </Button>
                </Group>
              </Group>
            </Card.Section>
            
            <Collapse in={filtersExpanded}>
              <Card.Section inheritPadding py="md">
                <Grid>
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <TextInput
                      label="From Date"
                      type="date"
                      value={filters.from}
                      onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                      size="sm"
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <TextInput
                      label="To Date"
                      type="date"
                      value={filters.to}
                      onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                      size="sm"
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Location"
                      data={locationOptions}
                      value={filters.locationId}
                      onChange={(v) => setFilters({ ...filters, locationId: v || "" })}
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Employee"
                      data={employeeOptions}
                      value={filters.employee}
                      onChange={(v) => setFilters({ ...filters, employee: v || "" })}
                      searchable
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Category"
                      data={categoryOptions}
                      value={filters.category}
                      onChange={(v) => setFilters({ ...filters, category: v || "" })}
                      searchable
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Status"
                      data={[
                        { value: "", label: "All Statuses" },
                        { value: "Pending", label: "Pending" },
                        { value: "Approved", label: "Approved" },
                        { value: "Rework", label: "Rework" },
                      ]}
                      value={filters.status}
                      onChange={(v) => setFilters({ ...filters, status: v || "" })}
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Priority"
                      data={[
                        { value: "", label: "All Priorities" },
                        { value: "Critical", label: "Critical" },
                        { value: "High", label: "High" },
                        { value: "Normal", label: "Normal" },
                        { value: "Low", label: "Low" },
                      ]}
                      value={filters.priority}
                      onChange={(v) => setFilters({ ...filters, priority: v || "" })}
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Has Photos"
                      data={[
                        { value: "", label: "All Tasks" },
                        { value: "true", label: "With Photos" },
                        { value: "false", label: "Without Photos" },
                      ]}
                      value={filters.hasPhotos}
                      onChange={(v) => setFilters({ ...filters, hasPhotos: v || "" })}
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Has Notes"
                      data={[
                        { value: "", label: "All Tasks" },
                        { value: "true", label: "With Notes" },
                        { value: "false", label: "Without Notes" },
                      ]}
                      value={filters.hasNotes}
                      onChange={(v) => setFilters({ ...filters, hasNotes: v || "" })}
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                  
                  <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
                    <Select
                      label="Rework Count"
                      data={[
                        { value: "", label: "All Tasks" },
                        { value: "0", label: "Never Reworked" },
                        { value: "1+", label: "Reworked 1+ Times" },
                      ]}
                      value={filters.reworkCount}
                      onChange={(v) => setFilters({ ...filters, reworkCount: v || "" })}
                      comboboxProps={{ withinPortal: true }}
                      size="sm"
                      clearable
                    />
                  </Grid.Col>
                </Grid>
              </Card.Section>
            </Collapse>
          </Card>

          {filtered.length === 0 ? (
            <Text c="dimmed" fz="sm">No submissions match your filters.</Text>
          ) : null}

          {filtered.map((s) => (
            <Card key={s.id} withBorder radius="lg" shadow="sm" mb="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{s.tasklistName}</Text>
                  <Text c="dimmed" fz="sm">
                    {s.date} • {locations.find((l) => String(l.id) === String(s.locationId))?.name || s.locationId} • By: {nameForUserId(s.submittedBy) || s.signedBy || "—"}
                  </Text>
                </div>
                <Badge variant="light" color={s.status === "Approved" ? "green" : s.status === "Rework" ? "yellow" : "gray"}>
                  {s.status}
                </Badge>
              </Group>

              <ScrollArea mt="sm">
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>
                        <input
                          type="checkbox"
                          checked={(selection[s.id]?.size || 0) === s.tasks.length}
                          onChange={(e) => {
                            const all = new Set(e.currentTarget.checked ? s.tasks.map((t) => t.taskId) : []);
                            setSelection((prev) => ({ ...prev, [s.id]: all }));
                          }}
                        />
                      </Table.Th>
                      <Table.Th>Task</Table.Th>
                      <Table.Th className="hide-sm">Value</Table.Th>
                      <Table.Th className="hide-sm">Note</Table.Th>
                      <Table.Th className="hide-sm">Photos</Table.Th>
                      <Table.Th className="hide-sm">Submitted By</Table.Th>
                      <Table.Th>Emp Status</Table.Th>
                      <Table.Th>Review</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {s.tasks.map((t, i) => {
                      const meta = getTaskMeta(s.tasklistId, t.taskId);
                      return (
                        <Table.Tr key={i}>
                          <Table.Td>
                            <input
                              type="checkbox"
                              checked={selection[s.id]?.has(t.taskId) || false}
                              onChange={() => toggle(s.id, t.taskId)}
                            />
                          </Table.Td>
                          <Table.Td><Text fw={600}>{getTaskMeta(s.tasklistId, t.taskId)?.title || t.taskId}</Text></Table.Td>
                          <Table.Td className="hide-sm">{t.value ?? "-"}</Table.Td>
                          <Table.Td className="hide-sm">{t.note || "-"}</Table.Td>
                          <Table.Td className="hide-sm">
                            {(t.photos || []).length ? (
                              <PhotoThumbs
                                urls={(t.photos || [])
                                  .filter(p => typeof p === 'string' && p.includes('/'))
                                  .map(p => toPublicUrl(supabase, 'evidence', p))}
                                size={56}
                                title="Evidence"
                              />
                            ) : "-"}
                          </Table.Td>
                          <Table.Td>{nameForUserId(t.submittedBy)}</Table.Td>
                          <Table.Td>
                            <Badge variant="outline" color={t.status === "Complete" ? "green" : "gray"}>
                              {t.na ? "N/A" : t.status}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              variant="outline"
                              color={t.reviewStatus === "Approved" ? "green" : t.reviewStatus === "Rework" ? "yellow" : "gray"}
                            >
                              {t.reviewStatus}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              variant="outline"
                              color={t.reviewStatus === "Approved" ? "green" : t.reviewStatus === "Rework" ? "yellow" : "gray"}
                            >
                              {t.reviewStatus}
                            </Badge>
                            {(t.reworkCount ?? 0) > 0 && (
                              <Text c="dimmed" fz="xs" mt={4}>
                                Reworked ×{t.reworkCount}{t.reviewNote ? ` — ${t.reviewNote}` : ""}
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>

              <Group justify="flex-end" mt="sm">
                <TextInput
                  label="Rework reason"
                  placeholder="What needs to be fixed?"
                  value={reworkNote}
                  onChange={(e) => setReworkNote(e.target.value)}
                  maw={480}
                />
                <Button
                  variant="default"
                  onClick={() => applyReview(s.id, "Rework", reworkNote /* from your TextInput */)}
                >
                  Rework Selected
                </Button>
                <Button onClick={() => applyReview(s.id, "Approved")}>
                  Approve Selected
                </Button>
              </Group>
            </Card>
          ))}
        </Tabs.Panel>

        <Tabs.Panel value="dashboard" pt="md">
          {/* Dashboard Filter Bar */}
          <Card withBorder radius="md" mb="lg" style={{ 
            background: isDark ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-0)',
            borderColor: isDark ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
          }}>
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between" align="center">
                <Group gap="sm" align="center">
                  <div>
                    <Text fw={600} size="md" c={isDark ? "white" : "dark"}>Dashboard Filters</Text>
                    <Text c={isDark ? "gray.3" : "dimmed"} size="sm">
                      Filter data by time period
                    </Text>
                  </div>
                </Group>
                
                <Group gap="sm">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      setFilters({ ...filters, from: "", to: "" });
                    }}
                  >
                    All Time
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      setFilters({ ...filters, from: weekAgo, to: today });
                    }}
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      setFilters({ ...filters, from: monthAgo, to: today });
                    }}
                  >
                    Last 30 Days
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const quarterAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      setFilters({ ...filters, from: quarterAgo, to: today });
                    }}
                  >
                    Last 3 Months
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      setFilters({ ...filters, from: yearAgo, to: today });
                    }}
                  >
                    Last Year
                  </Button>
                </Group>
              </Group>
            </Card.Section>
          </Card>

          {/* Dashboard Overview Cards */}
          <Grid mb="lg">
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder radius="md" style={{ 
                background: isDark ? 'var(--mantine-color-blue-9)' : 'var(--mantine-color-blue-0)',
                borderColor: 'var(--mantine-color-blue-6)'
              }}>
                <Group justify="space-between" align="center">
                  <div>
                    <Text c={isDark ? "blue.1" : "blue.8"} fw={600} size="sm">Total Tasks</Text>
                    <Text fw={700} fz="xl" c={isDark ? "white" : "dark"}>{totals.totalTasksCompleted}</Text>
                    <Text c={isDark ? "blue.2" : "blue.6"} size="xs">Completed</Text>
                  </div>
                  <div style={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: '50%', 
                    background: 'var(--mantine-color-blue-6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconCheck size={24} color="white" />
                  </div>
                </Group>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder radius="md" style={{ 
                background: isDark ? 'var(--mantine-color-yellow-9)' : 'var(--mantine-color-yellow-0)',
                borderColor: 'var(--mantine-color-yellow-6)'
              }}>
                <Group justify="space-between" align="center">
                  <div>
                    <Text c={isDark ? "yellow.1" : "yellow.8"} fw={600} size="sm">Rework Queue</Text>
                    <Text fw={700} fz="xl" c={isDark ? "white" : "dark"}>{totals.totalRework}</Text>
                    <Text c={isDark ? "yellow.2" : "yellow.6"} size="xs">Pending Review</Text>
                  </div>
                  <div style={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: '50%', 
                    background: 'var(--mantine-color-yellow-6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconBug size={24} color="white" />
                  </div>
                </Group>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder radius="md" style={{ 
                background: isDark ? 'var(--mantine-color-orange-9)' : 'var(--mantine-color-orange-0)',
                borderColor: 'var(--mantine-color-orange-6)'
              }}>
                <Group justify="space-between" align="center">
                  <div>
                    <Text c={isDark ? "orange.1" : "orange.8"} fw={600} size="sm">Reworked Tasks</Text>
                    <Text fw={700} fz="xl" c={isDark ? "white" : "dark"}>{totals.totalReworkedHistorical}</Text>
                    <Text c={isDark ? "orange.2" : "orange.6"} size="xs">Historical</Text>
                  </div>
                  <div style={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: '50%', 
                    background: 'var(--mantine-color-orange-6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconFilter size={24} color="white" />
                  </div>
                </Group>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder radius="md" style={{ 
                background: isDark ? 'var(--mantine-color-green-9)' : 'var(--mantine-color-green-0)',
                borderColor: 'var(--mantine-color-green-6)'
              }}>
                <Group justify="space-between" align="center">
                  <div>
                    <Text c={isDark ? "green.1" : "green.8"} fw={600} size="sm">Completion Rate</Text>
                    <Text fw={700} fz="xl" c={isDark ? "white" : "dark"}>
                      {submissions.length > 0 ? Math.round((totals.totalTasksCompleted / (submissions.length * 10)) * 100) : 0}%
                    </Text>
                    <Text c={isDark ? "green.2" : "green.6"} size="xs">Overall</Text>
                  </div>
                  <div style={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: '50%', 
                    background: 'var(--mantine-color-green-6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconListCheck size={24} color="white" />
                  </div>
                </Group>
              </Card>
            </Grid.Col>
          </Grid>

          {/* Charts Section */}
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" p="md" style={{ height: 400 }}>
                <Text fw={600} mb="md" c={isDark ? "white" : "dark"}>Tasks Completed by Employee</Text>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={byEmployee} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#444" : "#e0e0e0"} />
                    <XAxis 
                      dataKey="employee" 
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <YAxis 
                      allowDecimals={false}
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#2d3748' : '#fff',
                        border: isDark ? '1px solid #4a5568' : '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar 
                      dataKey="completed" 
                      fill={isDark ? "#4299e1" : "#3182ce"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" p="md" style={{ height: 400 }}>
                <Text fw={600} mb="md" c={isDark ? "white" : "dark"}>Submissions vs Expected</Text>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart 
                    data={(() => {
                      // Calculate expected vs actual submissions for the last 7 days
                      const days = [];
                      const today = new Date();
                      
                      for (let i = 6; i >= 0; i--) {
                        const date = new Date(today);
                        date.setDate(date.getDate() - i);
                        const dateStr = date.toISOString().slice(0, 10);
                        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                        
                        // Calculate expected tasks for this day
                        const expectedTasks = (checklists?.templates || []).reduce((total, template) => {
                          const dow = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
                          const templateDow = template.recurrence || [];
                          if (templateDow.includes(dow)) {
                            return total + (template.tasks || []).length;
                          }
                          return total;
                        }, 0);
                        
                        // Calculate actual submissions for this day
                        const actualSubmissions = filtered.filter(s => s.date === dateStr).length;
                        
                        days.push({
                          day: dayName,
                          expected: expectedTasks,
                          submitted: actualSubmissions
                        });
                      }
                      
                      return days;
                    })()}
                    margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#444" : "#e0e0e0"} />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <YAxis 
                      allowDecimals={false}
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#2d3748' : '#fff',
                        border: isDark ? '1px solid #4a5568' : '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="expected" 
                      stroke={isDark ? "#10b981" : "#059669"}
                      strokeWidth={2}
                      dot={{ fill: isDark ? "#10b981" : "#059669", strokeWidth: 2, r: 4 }}
                      name="Expected"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="submitted" 
                      stroke={isDark ? "#3b82f6" : "#2563eb"}
                      strokeWidth={2}
                      dot={{ fill: isDark ? "#3b82f6" : "#2563eb", strokeWidth: 2, r: 4 }}
                      name="Submitted"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Grid.Col>
          </Grid>

          {/* Additional Charts Row */}
          <Grid mt="md">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" p="md" style={{ height: 350 }}>
                <Text fw={600} mb="md" c={isDark ? "white" : "dark"}>Tasks by Category</Text>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart 
                    data={Array.from(
                      new Set(
                        filtered.flatMap(s => 
                          s.tasks.map(t => getTaskMeta(s.tasklistId, t.taskId)?.category || 'Uncategorized')
                        )
                      )
                    ).map(category => ({
                      category,
                      count: filtered.reduce((acc, s) => 
                        acc + s.tasks.filter(t => (getTaskMeta(s.tasklistId, t.taskId)?.category || 'Uncategorized') === category).length, 0
                      )
                    }))}
                    margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#444" : "#e0e0e0"} />
                    <XAxis 
                      dataKey="category" 
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <YAxis 
                      allowDecimals={false}
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#2d3748' : '#fff',
                        border: isDark ? '1px solid #4a5568' : '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill={isDark ? "#8b5cf6" : "#7c3aed"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" p="md" style={{ height: 350 }}>
                <Text fw={600} mb="md" c={isDark ? "white" : "dark"}>Rework Analysis</Text>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart 
                    data={[
                      { name: 'No Rework', value: filtered.reduce((acc, s) => acc + s.tasks.filter(t => (t.reworkCount || 0) === 0).length, 0) },
                      { name: '1 Rework', value: filtered.reduce((acc, s) => acc + s.tasks.filter(t => (t.reworkCount || 0) === 1).length, 0) },
                      { name: '2+ Reworks', value: filtered.reduce((acc, s) => acc + s.tasks.filter(t => (t.reworkCount || 0) >= 2).length, 0) }
                    ]}
                    margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#444" : "#e0e0e0"} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <YAxis 
                      allowDecimals={false}
                      tick={{ fill: isDark ? "#ccc" : "#666", fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#2d3748' : '#fff',
                        border: isDark ? '1px solid #4a5568' : '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar 
                      dataKey="value" 
                      fill={isDark ? "#ef4444" : "#dc2626"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Grid.Col>
          </Grid>

        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}


/** ---------------------- Main App ---------------------- */
const baseTheme = createTheme({
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"",
  headings: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"",
  },
  components: {
    Modal: {
      defaultProps: {
        withinPortal: true,
        zIndex: 10000,
        transitionProps: { duration: 0 },
        overlayProps: { opacity: 0.25, blur: 2 },
      },
    },
  },
});

function AppInner() {
  const [companyId, setCompanyId] = useState(null);

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId();
      setCompanyId(cid);
    })();
  }, []);

  const [mode, setMode] = useState("employee");
  const [activeLocationId, setActiveLocationId] = useState("");
  const [locations, setLocations] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState("");
  const [employees, setEmployees] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [positionFilter, setPositionFilter] = useState("");
  const [company, setCompany] = useState({ id: "", name: "", brandColor: "#0ea5e9", logo: null, timezone: "UTC" });
  const [checklists, setChecklists] = useState({ timeBlocks: [], templates: [], overrides: [] });
  const ModeTabsText = [
    { value: "employee", label: "Employee", icon: <IconUser size={14} /> },
    { value: "manager", label: "Manager", icon: <IconShieldHalf size={14} /> },
    { value: "admin", label: "Admin", icon: <IconLayoutGrid size={14} /> },
  ];
  const ModeTabsIcons = ModeTabsText.map(({ value, icon }) => ({ value, label: icon }));

  // GET Company from DB
  const loadCompany = useCallback(async () => {
    // [COMPANY_SCOPE]
    const c = await getCompany(companyId);
    setCompany({
      id: c.id, name: c.name ?? "",
      brandColor: c.brand_color ?? "#0ea5e9",
      logo: c.logo ?? null,
      timezone: c.timezone ?? "UTC",
    });
  }, [companyId]);

  // load once on mount
  const refreshHeaderData = useCallback(async () => {
    // [COMPANY_SCOPE]
    const [users, locs] = await Promise.all([fetchUsers(companyId), fetchLocations(companyId)]);
    setEmployees(users);
    setLocations(locs);
    setCurrentEmployee((cur) => users.find(u => String(u.id) === String(cur)) ? cur : (users[0] ? String(users[0].id) : ""));
    setActiveLocationId((cur) => locs.find(l => String(l.id) === String(cur)) ? cur : (locs[0] ? String(locs[0].id) : ""));
  }, [companyId]);

  const refreshCompanySettings = loadCompany;

  // initial load
  useEffect(() => { refreshHeaderData(); loadCompany(); }, [refreshHeaderData, loadCompany]);

  // Debounced refresh functions to prevent rapid-fire updates
  const debouncedRefreshHeaderData = useCallback(
    debounce(() => {
      refreshHeaderData();
    }, 300),
    [refreshHeaderData]
  );

  const debouncedLoadCompany = useCallback(
    debounce(() => {
      loadCompany();
    }, 300),
    [loadCompany]
  );

  // live updates when Admin creates/edits/deletes
  // realtime for header lists (scoped)
  useEffect(() => {
    // [COMPANY_SCOPE]
    if (!companyId) return;
    const ch = supabase
      .channel(`header-sync:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "location", filter: `company_id=eq.${companyId}` }, debouncedRefreshHeaderData)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_user", filter: `company_id=eq.${companyId}` }, debouncedRefreshHeaderData)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "company", filter: `id=eq.${companyId}` }, debouncedLoadCompany)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, debouncedRefreshHeaderData, debouncedLoadCompany]);

  // checklists data (time blocks + templates)
  const loadChecklists = useCallback(async () => {
    if (!companyId) return;
    const [tbs, tpls] = await Promise.all([
      listTimeBlocks(companyId),               // make sure your query is scoped
      listTasklistTemplates(companyId)         // and returns tasks inside
    ]);
    setChecklists({ timeBlocks: tbs, templates: tpls, overrides: [] });
  }, [companyId]);

  useEffect(() => { loadChecklists(); }, [loadChecklists]);

  // Debounced load checklists to prevent rapid-fire updates
  const debouncedLoadChecklists = useCallback(
    debounce(() => {
      loadChecklists();
    }, 300),
    [loadChecklists]
  );

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`checklists-sync:${companyId}`) // [COMPANY_SCOPE]
      .on("postgres_changes", { event: "*", schema: "public", table: "time_block", filter: `company_id=eq.${companyId}` }, debouncedLoadChecklists)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasklist_template", filter: `company_id=eq.${companyId}` }, debouncedLoadChecklists)
      // If task rows don't have company_id, add a trigger/column or skip this filter.
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tasklist_task",
        filter: `company_id=eq.${companyId}`
      }, debouncedLoadChecklists)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, debouncedLoadChecklists]);

  // Sets the brand color to whatever the DB has it as - optimized to prevent forced reflows
  useEffect(() => {
    // Use requestAnimationFrame to defer DOM updates and prevent forced reflows
    const updateBrandColor = () => {
      document.documentElement.style.setProperty("--brand", company.brandColor || "#0ea5e9");
    };
    
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(updateBrandColor);
    } else {
      setTimeout(updateBrandColor, 0);
    }
  }, [company.brandColor]);

  // Persisted scheme (UI preference)
  const [scheme, setScheme] = useLocalStorage({
    key: "theme",
    defaultValue: "light",
  });

  // Keep activeLocation valid when Admin edits locations - optimized with useMemo
  const validActiveLocationId = useMemo(() => {
    if (!locations.find((l) => String(l.id) === String(activeLocationId))) {
      return locations[0]?.id ? String(locations[0].id) : "";
    }
    return activeLocationId;
  }, [locations, activeLocationId]);

  useEffect(() => {
    if (validActiveLocationId !== activeLocationId) {
      setActiveLocationId(validActiveLocationId);
    }
  }, [validActiveLocationId, activeLocationId]);

  // Keep currentEmployee valid when Admin edits Users - optimized with useMemo
  const validCurrentEmployee = useMemo(() => {
    if (!employees.find((u) => String(u.id) === String(currentEmployee))) {
      return employees[0]?.id ? String(employees[0].id) : "";
    }
    return currentEmployee;
  }, [employees, currentEmployee]);

  useEffect(() => {
    if (validCurrentEmployee !== currentEmployee) {
      setCurrentEmployee(validCurrentEmployee);
    }
  }, [validCurrentEmployee, currentEmployee]);
  // Get today's date in the given timezone
  function todayISOInTz(tz) {
    // 'en-CA' -> 'YYYY-MM-DD'
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }


  const [todayTz, setTodayTz] = useState(() => todayISOInTz(company.timezone || 'UTC'));

  useEffect(() => {
    // re-evaluate immediately when timezone changes
    setTodayTz(todayISOInTz(company.timezone || 'UTC'));

    // tick every minute to catch midnight rollover in that tz
    const id = setInterval(() => {
      const d = todayISOInTz(company.timezone || 'UTC');
      setTodayTz(prev => (prev === d ? prev : d));
    }, 60_000);

    return () => clearInterval(id);
  }, [company.timezone]);

  // Today's tasklists (from admin templates + ad-hoc) - optimized with requestIdleCallback
  const [tasklistsToday, setTasklistsToday] = useState([]);
  
  useEffect(() => {
    const computeTasklists = () => {
      const today = todayISOInTz(company.timezone || 'UTC');
      const all = resolveTasklistsForDayFromLists(checklists, activeLocationId, today, company.timezone);
      if (!positionFilter) return all;
      // Filter templates by positions
      const pf = String(positionFilter).trim();
      return all.filter((tl) => {
        // find template meta to check positions
        const tpl = (checklists.templates || []).find((t) => t.id === tl.id);
        const positions = Array.isArray(tpl?.positions) ? tpl.positions : [];
        if (!pf) return true;
        // match if template has position equal to selection
        return positions.map(String).includes(pf);
      });
    };

    // Use requestIdleCallback to defer computation when browser is idle
    if (window.requestIdleCallback) {
      const idleCallback = window.requestIdleCallback(() => {
        setTasklistsToday(computeTasklists());
      }, { timeout: 100 });
      return () => window.cancelIdleCallback(idleCallback);
    } else {
      // Fallback for browsers without requestIdleCallback
      const timeoutId = setTimeout(() => {
        setTasklistsToday(computeTasklists());
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [checklists, activeLocationId, company.timezone, positionFilter]);
  const restockLocationId = tasklistsToday[0]?.locationId || null;

  useEffect(() => {
    if (!company.id || !activeLocationId || tasklistsToday.length === 0) return;

    let cancelled = false;

    const processWorkingState = async () => {
      const dateISO = todayISOInTz(company.timezone || 'UTC');

      // fetch all current tasklists' server state in parallel
      const results = await Promise.all(
        tasklistsToday.map(tl =>
          fetchSubmissionAndTasks({
            supabase,
            companyId: company.id,
            tasklistId: tl.id,
            locationId: tl.locationId,
            dateISO
          }).then(r => ({ tl, ...r }))
        )
      );

      if (cancelled) return;

      // Build a fresh working map from server rows, falling back to defaults
      const nextWorking = {};
      for (const { tl, tasks } of results) {
        const byId = new Map(tasks.map(r => [r.task_id, r]));
        nextWorking[tl.id] = tl.tasks.map(t => {
          const row = byId.get(t.id);
          return row
            ? {
              taskId: t.id,
              status: row.status,                         // 'Complete' | 'Incomplete'
              reviewStatus: row.review_status,            // 'Pending' | 'Approved' | 'Rework'
              na: !!row.na,
              // map value text back to UI type
              value: t.inputType === 'number'
                ? (row.value !== null && row.value !== '' ? Number(row.value) : null)
                : t.inputType === 'text'
                  ? (row.value ?? '')
                  : row.value,
              note: row.note ?? '',
              photos: Array.isArray(row.photos) ? row.photos : [],
            }
            : {
              taskId: t.id,
              status: 'Incomplete',
              reviewStatus: 'Pending',
              na: false,
              value: null,
              note: '',
              photos: [],
            };
        });
      }

      // Use requestIdleCallback to defer state update when browser is idle
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          if (!cancelled) setWorking(nextWorking);
        }, { timeout: 50 });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          if (!cancelled) setWorking(nextWorking);
        }, 0);
      }
    };

    processWorkingState();

    return () => { cancelled = true; };
  }, [supabase, company.id, company.timezone, tasklistsToday]);

  function getTaskMetaToday(tasklistId, taskId) {
    const tl = tasklistsToday.find((x) => x.id === tasklistId);
    return tl?.tasks.find((t) => t.id === taskId) || { title: taskId, inputType: "checkbox" };
  }

  function getTaskMetaForManagers(tasklistId, taskId) {
    // 1) today's resolved tasklists (depends on activeLocation/time)
    const tlToday = tasklistsToday.find(x => x.id === tasklistId);
    const metaToday = tlToday?.tasks?.find(t => t.id === taskId);
    if (metaToday) return metaToday;

    // 2) any template in company (independent of location/recurrence)
    const tlAny = (checklists.templates || []).find(x => x.id === tasklistId);
    const metaAny = tlAny?.tasks?.find(t => t.id === taskId);
    if (metaAny) return metaAny;

    // 3) fallback
    return { id: taskId, title: taskId, inputType: "checkbox" };
  }

  // Working state (per tasklist) - optimized initialization
  const [working, setWorking] = useState({});
  const [submissions, setSubmissions] = useState([]);
  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });
  const [employeeTab, setEmployeeTab] = useState('tasks');
  const [restockOpenCount, setRestockOpenCount] = useState(0);

  // Optimized working state synchronization with useMemo
  const optimizedWorkingState = useMemo(() => {
    return (prevWorking) => {
      const next = { ...prevWorking };

      tasklistsToday.forEach((tl) => {
        const existing = next[tl.id] ?? [];
        const byId = new Map(existing.map((s) => [s.taskId, s]));

        // ensure there's a state row for every current task
        const merged = tl.tasks.map((t) =>
          byId.get(t.id) ?? {
            taskId: t.id,
            status: "Incomplete",
            value: null,
            note: "",
            photos: [],
            na: false,
            reviewStatus: "Pending",
          }
        );

        next[tl.id] = merged;
      });

      // drop tasklists that no longer exist today
      Object.keys(next).forEach((k) => {
        if (!tasklistsToday.find((tl) => tl.id === k)) delete next[k];
      });

      return next;
    };
  }, [tasklistsToday]);

  useEffect(() => {
    setWorking(optimizedWorkingState);
  }, [optimizedWorkingState]);

  // Manager submissions filtered by position (to reflect the same filter globally)
  const submissionsFilteredByPosition = useMemo(() => {
    if (!positionFilter) return submissions;
    const pf = String(positionFilter).trim();
    const byId = new Map((checklists.templates || []).map(t => [t.id, t]));
    return submissions.filter((s) => {
      const tpl = byId.get(s.tasklistId);
      const positions = Array.isArray(tpl?.positions) ? tpl.positions.map(String) : [];
      return positions.includes(pf);
    });
  }, [submissions, checklists.templates, positionFilter]);

  function updateTaskState(tlId, taskId, patch) {
    setWorking((prev) => {
      const next = { ...prev };
      next[tlId] = next[tlId].map((ti) => (ti.taskId === taskId ? { ...ti, ...(typeof patch === "function" ? patch(ti) : patch) } : ti));
      return next;
    });
  }
  const handleComplete = async (tasklist, task) => {
    const st = working?.[tasklist.id]?.find((s) => s.taskId === task.id) ?? {};
    if (!canTaskBeCompleted(task, st)) {
      alert('Finish required inputs first (photo/note/number in range).');
      return;
    }

    setPinModal({
      open: true,
      onConfirm: async (pin) => {
        try {
          // 1) Validate PIN *per company* every time
          const user = await validatePin({ supabase, companyId: company.id, pin });
          if (!user) { 
            alert('Wrong PIN. Please try again.'); 
            // Don't close modal on wrong PIN - let user try again
            return; 
          }

          // 2) Find/create submission for today
          const dateISO = todayISOInTz(company.timezone || 'UTC');
          const submissionId = await findOrCreateSubmission({
            supabase,
            companyId: company.id,
            tasklistId: tasklist.id,
            locationId: tasklist.locationId,
            dateISO,
          });

          // 3) Map input to text (checkbox/number/text)
          const valueText =
            task.inputType === 'number' ? String(st.value ?? '')
              : task.inputType === 'text' ? String(st.note ?? '')
                : 'true';

          // 4) Upsert and stamp submitted_by = PIN user.id (UUID)
          await upsertSubmissionTask({
            supabase,
            submissionId,
            taskId: task.id,
            payload: {
              status: 'Complete',
              review_status: 'Pending',
              na: !!st.na,
              value: valueText || null,
              note: st.note ?? null,
              photos: Array.isArray(st.photos) ? st.photos : [],
              submitted_by: user.id,       // <<<<<<<<<< IMPORTANT
            },
          });

          // (optional) also stamp the parent submission with the same user if you add a matching column
          await supabase.from('submission')
            .update({ submitted_by: user.id })
            .eq('id', submissionId)
            .eq('company_id', company.id);

          // keep the rest of your refresh/optimistic UI as-is ...
          try {
            const { tasks } = await fetchSubmissionAndTasks({
              supabase,
              companyId: company.id,
              tasklistId: tasklist.id,
              locationId: tasklist.locationId,
              dateISO
            });
            const byId = new Map(tasks.map(r => [r.task_id, r]));
            setWorking(prev => ({
              ...prev,
              [tasklist.id]: tasklist.tasks.map(t => {
                const row = byId.get(t.id);
                return row ? {
                  taskId: t.id,
                  status: row.status,
                  reviewStatus: row.review_status,
                  na: !!row.na,
                  value: task.inputType === 'number'
                    ? (row.value !== null && row.value !== '' ? Number(row.value) : null)
                    : task.inputType === 'text'
                      ? (row.value ?? '')
                      : row.value,
                  note: row.note ?? '',
                  photos: Array.isArray(row.photos) ? row.photos : [],
                } : (prev[tasklist.id]?.find(x => x.taskId === t.id) ?? {
                  taskId: t.id, status: 'Incomplete', reviewStatus: 'Pending', na: false, value: null, note: '', photos: []
                });
              })
            }));
          } catch { }

          setWorking(prev => ({
            ...prev,
            [tasklist.id]: (prev[tasklist.id] ?? []).map(ti =>
              ti.taskId === task.id ? { ...ti, status: 'Complete', reviewStatus: 'Pending' } : ti
            ),
          }));

          // Only close modal on successful completion
          setPinModal({ open: false, onConfirm: null });
        } catch (e) {
          console.error(e);
          alert(e.message || 'Failed to complete task');
          // Don't close modal on error - let user try again
        }
      },
    });
  };

  const handleUpload = async (tasklist, task, file) => {
    try {
      const path = await uploadEvidence({
        supabase,
        bucket: 'evidence',
        companyId: company.id,
        tasklistId: tasklist.id,
        taskId: task.id,
        file
      });

      const dateISO = todayISOInTz(company.timezone || 'UTC');
      const submissionId = await findOrCreateSubmission({
        supabase, companyId: company.id, tasklistId: tasklist.id, locationId: tasklist.locationId, dateISO
      });

      // Read current server photos for this task (optional; or trust client state)
      const { data: row } = await supabase
        .from('submission_task')
        .select('status, review_status, na, value, note, photos')
        .eq('submission_id', submissionId)
        .eq('task_id', task.id)
        .maybeSingle();
      const serverPhotos = Array.isArray(row?.photos) ? row.photos : [];

      await upsertSubmissionTask({
        supabase,
        submissionId,
        taskId: task.id,
        payload: {
          status: row ? row.status : 'Incomplete',
          review_status: row ? row.review_status : 'Pending',
          photos: [...serverPhotos, path],
          na: row ? row.na : false,
          value: row?.value ?? null,
          note: row?.note ?? null,
        },
      });

      // also mirror to UI
      setWorking(prev => ({
        ...prev,
        [tasklist.id]: (prev[tasklist.id] ?? []).map(ti =>
          ti.taskId === task.id ? { ...ti, photos: [...(ti.photos || []), path] } : ti
        )
      }));
    } catch (e) {
      console.error(e);
      alert('Failed to upload photo');
    }
  };


  function canSubmitTasklist(tl) {
    const states = working[tl.id] ?? [];
    for (const t of tl.tasks) {
      const st = states.find((s) => s.taskId === t.id) || {};
      const ok = (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
      if (!ok) return false;
    }
    return true;
  }


  function signoff(tl) {
    if (!canSubmitTasklist(tl)) {
      alert("Please complete all required tasks first.");
      return;
    }
    setPinModal({
      open: true,
      onConfirm: async (pin) => {
        try {
          // Validate PIN before submission
          const user = await validatePin({ supabase, companyId: company.id, pin });
          if (!user) { 
            alert('Wrong PIN. Please try again.'); 
            // Don't close modal on wrong PIN - let user try again
            return; 
          }

          const payload = (working[tl.id] ?? []).map((t) => ({ ...t, reviewStatus: "Pending" }));
          const submission = {
            id: `ci_${Date.now()}`,
            tasklistId: tl.id,
            tasklistName: tl.name,
            locationId: tl.locationId,
            date: todayISO(),
            status: "Pending",
            signedBy: `PIN-${pin}`,
            submittedBy: currentEmployee,
            signedAt: new Date().toISOString(),
            tasks: payload,
          };
          setSubmissions((prev) => [submission, ...prev]);
          setWorking((prev) => ({
            ...prev,
            [tl.id]: (prev[tl.id] ?? []).map((t) => ({ ...t, reviewStatus: "Pending" })),
          }));
          
          // Only close modal on successful submission
          setPinModal({ open: false, onConfirm: null });
          alert("Submitted for manager review.");
        } catch (e) {
          console.error(e);
          alert(e.message || 'Failed to submit tasklist');
          // Don't close modal on error - let user try again
        }
      },
    });
  }

  // before the return, right after hooks:

  return (
    <MantineProvider theme={baseTheme} forceColorScheme={scheme}>
      <AppShell
        header={{ height: 100 }}
        padding="md"
        withBorder={false}
        styles={{ main: { minHeight: "100dvh", background: "var(--mantine-color-body)" } }}
      >
        <AppShell.Header style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          {/** Mobile/Tablet Drawer state */}
          {(() => {
            const [opened, { open, close, toggle }] = useDisclosure(false);
            return (
              <>
                {/* Top bar */}
                <Group h={56} px="sm" justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
                  {/* Left: brand */}
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Burger opened={opened} onClick={toggle} aria-label="Open menu" hiddenFrom="sm" />
                    {company.logo ? (
                      <img src={company.logo} alt="Logo" style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: company.brandColor }} />
                    )}
                    {/* Hide long name on phones, show on ≥sm */}
                    <Text fw={700} truncate visibleFrom="sm">{company.name}</Text>
                  </Group>

                  {/* Right: compact controls */}
                  <Group gap="xs" wrap="nowrap">
                    {/* Mode tabs: icons on mobile, text on ≥md */}
                    <SegmentedControl
                      value={mode}
                      onChange={setMode}
                      data={ModeTabsIcons}
                      hiddenFrom="sm"
                    />
                    <SegmentedControl
                      value={mode}
                      onChange={setMode}
                      data={ModeTabsText}
                      visibleFrom="sm"
                      styles={{ root: { maxWidth: 360 } }}
                    />

                    {/* Employee + Location quick buttons (open drawer on mobile) */}
                    <ActionIcon variant="default" title="Employee / Location" onClick={open} hiddenFrom="sm">
                      <IconUser size={16} />
                    </ActionIcon>
                    <ActionIcon variant="default" title="Theme" onClick={() => setScheme(scheme === "dark" ? "light" : "dark")} hiddenFrom="sm">
                      {scheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
                    </ActionIcon>

                    {/* Full controls on ≥sm */}
                    <Group gap="xs" visibleFrom="sm" wrap="nowrap">
                      <Select
                        value={currentEmployee}
                        onChange={setCurrentEmployee}
                        data={employees.map((l) => ({ value: String(l.id), label: l.display_name }))}
                        w={200}
                        leftSection={<IconUser size={14} />}
                        comboboxProps={{ withinPortal: true }}
                        placeholder="Employee"
                        searchable
                      />
                      <Select
                        value={activeLocationId}
                        onChange={setActiveLocationId}
                        data={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                        w={180}
                        leftSection={<IconMapPin size={14} />}
                        comboboxProps={{ withinPortal: true }}
                        placeholder="Location"
                        searchable
                      />
                      <BugReport companyId={companyId} employeeId={currentEmployee} />
                      <Button
                        onClick={async () => { await supabase.auth.signOut(); }}
                        leftSection={<IconLogout size={16} />}
                        variant="default"
                      >
                        Logout
                      </Button>
                      <ThemeToggle scheme={scheme} setScheme={setScheme} />
                    </Group>
                  </Group>
                </Group>

                {/* Drawer for mobile controls */}
                <Drawer opened={opened} onClose={close} title={company.name || "Menu"} padding="md" size="100%" hiddenFrom="sm">
                  <Stack gap="md">
                    <SegmentedControl value={mode} onChange={setMode} data={ModeTabsText} />
                    <Divider label="Context" />
                    <Select
                      label="Employee"
                      value={currentEmployee}
                      onChange={setCurrentEmployee}
                      data={employees.map((l) => ({ value: String(l.id), label: l.display_name }))}
                      leftSection={<IconUser size={14} />}
                      searchable
                      comboboxProps={{ withinPortal: true }}
                    />
                    <Select
                      label="Location"
                      value={activeLocationId}
                      onChange={setActiveLocationId}
                      data={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                      leftSection={<IconMapPin size={14} />}
                      searchable
                      comboboxProps={{ withinPortal: true }}
                    />
                    <Divider />
                    <Group justify="space-between">
                      <BugReport companyId={companyId} employeeId={currentEmployee} />
                      <Group>
                        <ActionIcon
                          variant="default"
                          onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}
                          title="Toggle theme"
                        >
                          {scheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
                        </ActionIcon>
                        <Button leftSection={<IconLogout size={16} />} variant="light"
                          onClick={async () => { await supabase.auth.signOut(); }}>
                          Logout
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                </Drawer>
              </>
            );
          })()}
        </AppShell.Header>

        {/* Page-level tabs sticky under header */}
        {mode === 'employee' && (
          <div
            style={{
              position: 'sticky',
              top: 100,
              zIndex: 2,
              background: 'var(--mantine-color-body)',
            }}
          >
            <Container size="xl">
              <Tabs
                value={employeeTab}
                onChange={setEmployeeTab}
                variant="pills"
                keepMounted={false}
                styles={{
                  list: { gap: 6 },
                  tab: {
                    borderRadius: 9999,
                    transition: 'transform 120ms ease, background-color 120ms ease',
                  },
                  tabLabel: { display: 'flex', alignItems: 'center', gap: 8 },
                }}
              >
                <Group justify="space-between" align="center" py="xs">
                  <Tabs.List>
                    <Tabs.Tab
                      value="tasks"
                      leftSection={<IconListCheck size={14} />}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      Tasks
                    </Tabs.Tab>

                    <Tabs.Tab
                      value="restock"
                      leftSection={<IconShoppingCart size={14} />}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      <Group gap={6} wrap="nowrap">
                        <span>Restock</span>
                        {restockOpenCount > 0 && (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 9999,
                              background: 'var(--mantine-color-red-6)',
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </Group>
                    </Tabs.Tab>
                  </Tabs.List>

                  {/* Right: Filters button lives *only* in this mini nav */}
                   <Popover
                    opened={filtersOpen}
                    onChange={setFiltersOpen}
                    position="bottom-end"
                    withArrow
                    shadow="md"
                    withinPortal
                    closeOnClickOutside={false}
                    transitionProps={{ transition: 'pop', duration: 120 }}
                    visibleFrom="sm"
                  >
                    <Popover.Target>
                      <ActionIcon
                        variant="default"
                        title="Filters"
                        onClick={() => setFiltersOpen(true)}
                        aria-label="Open filters"
                      >
                        <IconFilter size={16} />
                      </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <EmployeeFiltersForm
                        positionFilter={positionFilter}
                        setPositionFilter={setPositionFilter}
                        templates={checklists.templates}
                        onClose={() => setFiltersOpen(false)}
                      />
                    </Popover.Dropdown>
                  </Popover>

                  {/* Mobile: full-screen modal with same content */}
                  <ActionIcon
                    variant="default"
                    title="Filters"
                    onClick={() => setFiltersOpen(true)}
                    aria-label="Toggle filters"
                    hiddenFrom="sm"
                  >
                    <IconFilter size={16} />
                  </ActionIcon>
                  <Modal
                    opened={filtersOpen}
                    onClose={() => setFiltersOpen(false)}
                    fullScreen
                    padding="md"
                    hiddenFrom="sm"
                    title="Filters"
                    centered={false}
                  >
                    <EmployeeFiltersForm
                      positionFilter={positionFilter}
                      setPositionFilter={setPositionFilter}
                      templates={checklists.templates}
                      onClose={() => setFiltersOpen(false)}
                    />
                  </Modal>
                </Group>
              </Tabs>
            </Container>
          </div>
        )}



        <AppShell.Main>
          {!companyId ? (
            <Center mih="60dvh"><Loader /></Center>
          ) : (
            <Container size="xl">
              {mode === "employee" && (
                <EmployeeView
                  tasklists={tasklistsToday}
                  checklists={checklists}
                  timezone={company.timezone}
                  working={working}
                  updateTaskState={updateTaskState}
                  handleComplete={handleComplete}
                  handleUpload={handleUpload}
                  signoff={signoff}
                  submissions={submissions}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  company={company}
                  tab={employeeTab}
                  onRestockOpenCountChange={setRestockOpenCount}
                  employees={employees}
                  currentEmployee={currentEmployee}
                />
              )}
              {mode === "manager" && (
                <ManagerView
                  submissions={submissionsFilteredByPosition}
                  company={company}
                  checklists={checklists}
                  locations={locations}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  getTaskMeta={getTaskMetaForManagers}
                  employees={employees}
                />
              )}

              {mode === "admin" && (
                <div style={{ paddingInline: "1px", paddingTop: 0, paddingBottom: "16px" }}>
                  <Suspense fallback={<Center mih="60dvh"><Loader /></Center>}>
                    <AdminView
                      companyId={company.id}
                      tasklists={tasklistsToday}
                      onReloadChecklists={loadChecklists}
                      submissions={submissions}
                      onBrandColorChange={() => { }}
                      locations={locations}
                      refreshHeaderData={refreshHeaderData}
                      refreshCompanySettings={refreshCompanySettings}
                      users={employees}
                    />
                  </Suspense>
                </div>
              )}

            </Container>
          )}
        </AppShell.Main>

        <PinDialog opened={pinModal.open} onClose={() => setPinModal({ open: false, onConfirm: null })} onConfirm={pinModal.onConfirm} />
      </AppShell>
    </MantineProvider>
  );
}


export default function App() {
  // Fully in the app
  return (
    <MantineProvider>
      <AppInner />
    </MantineProvider>
  );
}
