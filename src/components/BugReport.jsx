// src/components/BugReport.jsx
import React, { useMemo, useState } from "react";
import {
  Button,
  Modal,
  Stack,
  Group,
  Text,
  TextInput,
  Textarea,
  FileButton,
  Badge,
} from "@mantine/core";
import { IconBug, IconUpload, IconCheck } from "@tabler/icons-react";
import { supabase } from "../lib/supabase";

function niceFileName(file) {
  const base = file?.name?.replace(/\s+/g, "_") || "screenshot";
  const ext = base.includes(".") ? base.split(".").pop() : "png";
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export default function BugReport({ companyId, employeeId }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const canSubmit = useMemo(() => form.name.trim() && form.description.trim(), [form]);

  function extractValue(input) {
    // Mantine TextInput/Textarea send a DOM event; but be defensive.
    if (input && typeof input === 'object' && 'currentTarget' in input) {
      return input.currentTarget?.value;
    }
    if (typeof input === 'string') return input; // in case a lib sends direct string
    return undefined; // <-- important: do NOT force ""
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      let screenshot_url = null;

      if (file) {
        const path = `company/${companyId}/${niceFileName(file)}`;
        const { data, error } = await supabase.storage
          .from("bugs")
          .upload(path, file, { upsert: false });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("bugs").getPublicUrl(data.path);
        screenshot_url = pub?.publicUrl ?? null;
      }

      const payload = {
        name: form.name,
        description: form.description,
        company_id: companyId,
        employee: employeeId,
        screenshot_url,
      };

      const { error: insertErr } = await supabase.from("bugs").insert(payload);
      if (insertErr) throw insertErr;

      setSubmitted(true);
      setForm({ name: "", description: "" });
      setFile(null);
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to submit bug");
    } finally {
      setSubmitting(false);
    }
  }

  // Prevent accidental form submit via Enter in text inputs
  function preventEnterSubmit(e) {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  }

  return (
    <>
      <Button variant="default" leftSection={<IconBug size={16} />} onClick={() => { setOpen(true); setSubmitted(false); }}>
        Report bug
      </Button>

      <Modal opened={open} onClose={() => setOpen(false)} title={submitted ? "Thanks!" : "Report a bug"} centered>
        {submitted ? (
          <Stack align="center" gap="sm">
            <IconCheck size={36} />
            <Text fw={700}>Completed — team will review</Text>
            <Text c="dimmed" ta="center">We’ve logged your report. You can close this window.</Text>
            <Group justify="center"><Button type="button" onClick={() => setOpen(false)}>Close</Button></Group>
          </Stack>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }}
            noValidate
          >
            <Stack gap="sm">
              <TextInput
                label="Your name"
                placeholder="Jane Doe"
                value={form.name ?? ""}
                onChange={(e) => {
                  const v = extractValue(e);
                  if (v === undefined) return;            // ignore weird/null events
                  setForm((f) => ({ ...f, name: v }));
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                autoFocus
                autoComplete="off"
              />

              <Textarea
                label="Description"
                placeholder="What happened? Steps to reproduce, expected vs actual…"
                minRows={4}
                value={form.description ?? ""}
                onChange={(e) => {
                  const v = extractValue(e);
                  if (v === undefined) return;            // ignore weird/null events
                  setForm((f) => ({ ...f, description: v }));
                }}
                autosize
                autoComplete="off"
              />

              <Group gap="xs">
                <FileButton onChange={setFile} accept="image/*">
                  {(props) => (
                    <Button type="button" variant="default" leftSection={<IconUpload size={16} />} {...props}>
                      {file ? "Replace screenshot" : "Upload screenshot"}
                    </Button>
                  )}
                </FileButton>
                {file ? <Badge variant="light">{file.name}</Badge> : null}
              </Group>

              <Group justify="flex-end">
                <Button type="submit" onClick={undefined} loading={submitting} disabled={!canSubmit}>
                  Submit bug
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </>
  );
}
